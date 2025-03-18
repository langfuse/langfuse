import { Job, Processor } from "bullmq";
import {
  clickhouseClient,
  getClickhouseEntityType,
  getCurrentSpan,
  getQueue,
  IngestionEventType,
  logger,
  QueueName,
  recordDistribution,
  recordIncrement,
  redis,
  StorageService,
  StorageServiceFactory,
  TQueueJobTypes,
  traceException,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { env } from "../env";
import { IngestionService } from "../services/IngestionService";
import { ClickhouseWriter, TableName } from "../services/ClickhouseWriter";
import { chunk } from "lodash";
import { randomUUID } from "crypto";

let s3StorageServiceClient: StorageService;

const getS3StorageServiceClient = (bucketName: string): StorageService => {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = StorageServiceFactory.getInstance({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  }
  return s3StorageServiceClient;
};

export const ingestionQueueProcessorBuilder = (
  enableRedirectToSecondaryQueue: boolean,
): Processor => {
  const projectIdsToRedirectToSecondaryQueue =
    env.LANGFUSE_SECONDARY_INGESTION_QUEUE_ENABLED_PROJECT_IDS?.split(",") ??
    [];

  return async (job: Job<TQueueJobTypes[QueueName.IngestionQueue]>) => {
    try {
      const span = getCurrentSpan();
      if (span) {
        span.setAttribute("messaging.bullmq.job.input.id", job.data.id);
        span.setAttribute(
          "messaging.bullmq.job.input.projectId",
          job.data.payload.authCheck.scope.projectId,
        );
        span.setAttribute(
          "messaging.bullmq.job.input.eventBodyId",
          job.data.payload.data.eventBodyId,
        );
        span.setAttribute(
          "messaging.bullmq.job.input.type",
          job.data.payload.data.type,
        );
        span.setAttribute(
          "messaging.bullmq.job.input.fileKey",
          job.data.payload.data.fileKey ?? "",
        );
      }

      // We write the new file into the ClickHouse event log to keep track for retention and deletions
      const clickhouseWriter = ClickhouseWriter.getInstance();
      const fileName = job.data.payload.data.fileKey
        ? `${job.data.payload.data.fileKey}.json`
        : "";
      clickhouseWriter.addToQueue(TableName.EventLog, {
        id: randomUUID(),
        project_id: job.data.payload.authCheck.scope.projectId,
        entity_type: getClickhouseEntityType(job.data.payload.data.type),
        entity_id: job.data.payload.data.eventBodyId,
        event_id: job.data.payload.data.fileKey ?? null,
        bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
        bucket_path: `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${job.data.payload.authCheck.scope.projectId}/${getClickhouseEntityType(job.data.payload.data.type)}/${job.data.payload.data.eventBodyId}/${fileName}`,
        created_at: new Date().getTime(),
        updated_at: new Date().getTime(),
      });

      // If fileKey was processed within the last minutes, i.e. has a match in redis, we skip processing.
      if (
        env.LANGFUSE_ENABLE_REDIS_SEEN_EVENT_CACHE === "true" &&
        redis &&
        job.data.payload.data.fileKey
      ) {
        const key = `langfuse:ingestion:recently-processed:${job.data.payload.authCheck.scope.projectId}:${job.data.payload.data.type}:${job.data.payload.data.eventBodyId}:${job.data.payload.data.fileKey}`;
        const exists = await redis.exists(key);
        if (exists) {
          recordIncrement("langfuse.ingestion.recently_processed_cache", 1, {
            type: job.data.payload.data.type,
            skipped: "true",
          });
          logger.debug(
            `Skipping ingestion event ${job.data.payload.data.fileKey} for project ${job.data.payload.authCheck.scope.projectId}`,
          );
          return;
        } else {
          recordIncrement("langfuse.ingestion.recently_processed_cache", 1, {
            type: job.data.payload.data.type,
            skipped: "false",
          });
        }
      }

      if (
        enableRedirectToSecondaryQueue &&
        projectIdsToRedirectToSecondaryQueue.includes(
          job.data.payload.authCheck.scope.projectId,
        )
      ) {
        logger.debug(
          `Redirecting ingestion event to secondary queue for project ${job.data.payload.authCheck.scope.projectId}`,
        );
        const secondaryQueue = getQueue(QueueName.IngestionSecondaryQueue);
        if (secondaryQueue) {
          await secondaryQueue.add(QueueName.IngestionSecondaryQueue, job.data);
          // If we don't redirect, we continue with the ingestion. Otherwise, we finish here.
          return;
        }
      }

      const s3Client = getS3StorageServiceClient(
        env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      );

      logger.info(
        `Processing ingestion event ${
          enableRedirectToSecondaryQueue ? "" : "secondary"
        }`,
        {
          projectId: job.data.payload.authCheck.scope.projectId,
          payload: job.data.payload.data,
        },
      );

      // Download all events from folder into a local array
      const clickhouseEntityType = getClickhouseEntityType(
        job.data.payload.data.type,
      );
      const eventFiles = await s3Client.listFiles(
        `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${job.data.payload.authCheck.scope.projectId}/${clickhouseEntityType}/${job.data.payload.data.eventBodyId}/`,
      );

      recordDistribution(
        "langfuse.ingestion.count_files_distribution",
        eventFiles.length,
        {
          kind: clickhouseEntityType,
        },
      );
      span?.setAttribute(
        "langfuse.ingestion.event.count_files",
        eventFiles.length,
      );
      span?.setAttribute("langfuse.ingestion.event.kind", clickhouseEntityType);

      const firstS3WriteTime =
        eventFiles
          .map((fileRef) => fileRef.createdAt)
          .sort()
          .shift() ?? new Date();

      const S3_CONCURRENT_READS = env.LANGFUSE_S3_CONCURRENT_READS;
      const events: IngestionEventType[] = [];

      // Process files in batches
      // If a user has 5k events, this will likely take 100 seconds.
      const downloadAndParseFile = async (fileRef: { file: string }) => {
        const file = await s3Client.download(fileRef.file);
        const parsedFile = JSON.parse(file);
        return Array.isArray(parsedFile) ? parsedFile : [parsedFile];
      };

      const batches = chunk(eventFiles, S3_CONCURRENT_READS);
      for (const batch of batches) {
        const batchEvents = await Promise.all(batch.map(downloadAndParseFile));
        events.push(...batchEvents.flat());
      }

      if (events.length === 0) {
        logger.warn(
          `No events found for project ${job.data.payload.authCheck.scope.projectId} and event ${job.data.payload.data.eventBodyId}`,
        );
        return;
      }

      // Set "seen" keys in Redis to avoid reprocessing for fast updates.
      if (env.LANGFUSE_ENABLE_REDIS_SEEN_EVENT_CACHE === "true" && redis) {
        const pipeline = redis.pipeline();
        for (const event of eventFiles) {
          const key = event.file.split("/").pop() ?? "";
          pipeline.set(
            `langfuse:ingestion:recently-processed:${job.data.payload.authCheck.scope.projectId}:${job.data.payload.data.type}:${job.data.payload.data.eventBodyId}:${key?.replace(".json", "")}`,
            "1",
            "EX",
            60 * 5, // 5 minutes
          );
        }
        await pipeline.exec();
      }

      // Perform merge of those events
      if (!redis) throw new Error("Redis not available");
      if (!prisma) throw new Error("Prisma not available");
      await new IngestionService(
        redis,
        prisma,
        clickhouseWriter,
        clickhouseClient({
          tags: {
            feature: "ingestion",
            projectId: job.data.payload.authCheck.scope.projectId,
          },
        }),
      ).mergeAndWrite(
        getClickhouseEntityType(events[0].type),
        job.data.payload.authCheck.scope.projectId,
        job.data.payload.data.eventBodyId,
        firstS3WriteTime,
        events,
      );
    } catch (e) {
      logger.error(
        `Failed job ingestion processing for ${job.data.payload.authCheck.scope.projectId}`,
        e,
      );
      traceException(e);
      throw e;
    }
  };
};
