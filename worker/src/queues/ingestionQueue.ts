import { Job, Processor } from "bullmq";
import {
  clickhouseClient,
  getClickhouseEntityType,
  getCurrentSpan,
  getS3EventStorageClient,
  hasS3SlowdownFlag,
  IngestionEventType,
  isS3SlowDownError,
  logger,
  markProjectS3Slowdown,
  QueueName,
  recordDistribution,
  recordHistogram,
  recordIncrement,
  redis,
  SecondaryIngestionQueue,
  safeS3ObjectKeySegment,
  TQueueJobTypes,
  traceException,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { env } from "../env";
import { IngestionService } from "../services/IngestionService";
import { ClickhouseWriter, TableName } from "../services/ClickhouseWriter";
import { chunk } from "lodash";
import { randomUUID } from "crypto";

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

      const projectId = job.data.payload.authCheck.scope.projectId;
      const jobEventBodyId = job.data.payload.data.eventBodyId;
      const clickhouseEntityType = getClickhouseEntityType(
        job.data.payload.data.type,
      );
      const safeEventBodyId = safeS3ObjectKeySegment(jobEventBodyId);
      const s3Prefix = `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${projectId}/${clickhouseEntityType}/${safeEventBodyId}/`;
      const legacyS3Prefix =
        safeEventBodyId === jobEventBodyId
          ? null
          : `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${projectId}/${clickhouseEntityType}/${jobEventBodyId}/`;
      const fileKey = job.data.payload.data.fileKey;
      const fileName = fileKey ? `${job.data.payload.data.fileKey}.json` : null;
      const bucketPath = job.data.payload.data.bucketPath;

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

      // Check if project should be redirected to secondary queue
      const shouldRedirectEnv =
        projectIdsToRedirectToSecondaryQueue.includes(projectId);
      const shouldRedirectSlowdown = await hasS3SlowdownFlag(projectId);

      if (
        enableRedirectToSecondaryQueue &&
        (shouldRedirectEnv || shouldRedirectSlowdown)
      ) {
        logger.debug(
          `Redirecting ingestion event to secondary queue for project ${projectId}`,
          {
            reason: shouldRedirectSlowdown ? "s3_slowdown_flag" : "env_config",
          },
        );
        const shardingKey = `${projectId}-${jobEventBodyId}`;
        const secondaryQueue = SecondaryIngestionQueue.getInstance({
          shardingKey,
        });
        if (secondaryQueue) {
          await secondaryQueue.add(QueueName.IngestionSecondaryQueue, job.data);
          // If we don't redirect, we continue with the ingestion. Otherwise, we finish here.
          return;
        }
      }

      const s3Client = getS3EventStorageClient(
        env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      );

      logger.debug(
        `Processing ingestion event ${
          enableRedirectToSecondaryQueue ? "" : "secondary"
        }`,
        {
          projectId: job.data.payload.authCheck.scope.projectId,
          payload: job.data.payload.data,
        },
      );

      let eventFiles: { file: string; createdAt: Date }[] = [];
      const events: IngestionEventType[] = [];

      // Check if we should skip S3 list operation
      const shouldSkipS3List =
        // The producer sets skipS3List to true if it's an OTel observation
        job.data.payload.data.skipS3List && job.data.payload.data.fileKey;

      let totalS3DownloadSizeBytes = 0;

      if (shouldSkipS3List) {
        // Direct file download - skip S3 list operation
        if (!fileName) {
          throw new Error("Missing fileKey for direct S3 ingestion download");
        }
        const filePath = bucketPath ?? `${s3Prefix}${fileName}`;
        const legacyFilePath = legacyS3Prefix
          ? `${legacyS3Prefix}${fileName}`
          : null;
        eventFiles = [{ file: filePath, createdAt: new Date() }];

        let file: string;
        try {
          file = await s3Client.download(filePath);
        } catch (e) {
          if (!legacyFilePath) {
            throw e;
          }

          logger.warn(
            "Failed to download ingestion file from sanitized S3 path, retrying legacy raw event body id path",
            {
              projectId,
              type: job.data.payload.data.type,
              eventBodyId: jobEventBodyId,
              fileKey: job.data.payload.data.fileKey,
              error: e,
            },
          );
          file = await s3Client.download(legacyFilePath);
          eventFiles = [{ file: legacyFilePath, createdAt: new Date() }];
        }
        const fileSize = file.length;

        recordHistogram("langfuse.ingestion.s3_file_size_bytes", fileSize, {
          skippedS3List: "true",
        });
        totalS3DownloadSizeBytes += fileSize;

        const parsedFile = JSON.parse(file);
        events.push(...(Array.isArray(parsedFile) ? parsedFile : [parsedFile]));
      } else {
        const listPrefix = bucketPath
          ? bucketPath.slice(0, bucketPath.lastIndexOf("/") + 1)
          : s3Prefix;
        eventFiles = await s3Client.listFiles(listPrefix);
        if (eventFiles.length === 0 && legacyS3Prefix) {
          const legacyEventFiles = await s3Client.listFiles(legacyS3Prefix);
          if (legacyEventFiles.length > 0) {
            logger.warn(
              "No ingestion files found under sanitized S3 prefix, retrying legacy raw event body id prefix",
              {
                projectId,
                type: job.data.payload.data.type,
                eventBodyId: jobEventBodyId,
              },
            );
            eventFiles = legacyEventFiles;
          }
        }

        // Process files in batches
        // If a user has 5k events, this will likely take 100 seconds.
        const downloadAndParseFile = async (fileRef: { file: string }) => {
          const file = await s3Client.download(fileRef.file);
          const fileSize = file.length;

          recordHistogram("langfuse.ingestion.s3_file_size_bytes", fileSize, {
            skippedS3List: "false",
          });
          totalS3DownloadSizeBytes += fileSize;

          const parsedFile = JSON.parse(file);
          return Array.isArray(parsedFile) ? parsedFile : [parsedFile];
        };

        const S3_CONCURRENT_READS = env.LANGFUSE_S3_CONCURRENT_READS;
        const batches = chunk(eventFiles, S3_CONCURRENT_READS);
        for (const batch of batches) {
          const batchEvents = await Promise.all(
            batch.map(downloadAndParseFile),
          );
          events.push(...batchEvents.flat());
        }
      }

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
      span?.setAttribute(
        "langfuse.ingestion.s3_all_files_size_bytes",
        totalS3DownloadSizeBytes,
      );

      const firstS3WriteTime =
        eventFiles
          .map((fileRef) => fileRef.createdAt)
          .sort()
          .shift() ?? new Date();

      if (events.length === 0) {
        logger.warn(
          `No events found for project ${projectId} and event ${jobEventBodyId}`,
        );
        return;
      }

      const resolvedEventBodyId = events[0]?.body?.id ?? jobEventBodyId;

      if (
        env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG === "true" &&
        job.data.payload.data.fileKey &&
        fileName
      ) {
        const bucketPath =
          eventFiles.find((eventFile) =>
            eventFile.file.endsWith(`/${fileName}`),
          )?.file ?? `${s3Prefix}${fileName}`;
        clickhouseWriter.addToQueue(TableName.BlobStorageFileLog, {
          id: randomUUID(),
          project_id: projectId,
          entity_type: clickhouseEntityType,
          entity_id: resolvedEventBodyId,
          event_id: job.data.payload.data.fileKey,
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: bucketPath,
          created_at: new Date().getTime(),
          updated_at: new Date().getTime(),
          event_ts: new Date().getTime(),
          is_deleted: 0,
        });
      }

      // Set "seen" keys in Redis to avoid reprocessing for fast updates.
      // We use Promise.all internally instead of a redis.pipeline since autoPipelining should handle it correctly
      // while being redis cluster aware.
      if (env.LANGFUSE_ENABLE_REDIS_SEEN_EVENT_CACHE === "true" && redis) {
        try {
          await Promise.all(
            eventFiles
              .map((e) => e.file.split("/").pop() ?? "")
              .map((key) =>
                redis!.set(
                  `langfuse:ingestion:recently-processed:${projectId}:${job.data.payload.data.type}:${resolvedEventBodyId}:${key.replace(".json", "")}`,
                  "1",
                  "EX",
                  60 * 5, // 5 minutes
                ),
              ),
          );
        } catch (e) {
          logger.warn(
            `Failed to set recently-processed cache. Continuing processing.`,
            e,
          );
        }
      }

      // Perform merge of those events
      if (!redis) throw new Error("Redis not available");
      if (!prisma) throw new Error("Prisma not available");

      // Determine whether to forward to staging events table
      // Use explicit flag from job payload if provided, otherwise fall back to env flags
      const forwardToEventsTable =
        job.data.payload.data.forwardToEventsTable ??
        env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true";

      await new IngestionService(
        redis,
        prisma,
        clickhouseWriter,
        clickhouseClient(),
      ).mergeAndWrite(
        getClickhouseEntityType(events[0].type),
        projectId,
        resolvedEventBodyId,
        firstS3WriteTime,
        events,
        forwardToEventsTable,
      );
    } catch (e) {
      // Check if this is a SlowDown error and mark the project for secondary queue
      if (isS3SlowDownError(e)) {
        const projectId = job.data.payload.authCheck.scope.projectId;
        logger.warn(
          "S3 SlowDown error during ingestion processing, marking project for secondary queue",
          { projectId, error: e },
        );
        await markProjectS3Slowdown(projectId);
      }

      logger.error(
        `Failed job ingestion processing for ${job.data.payload.authCheck.scope.projectId}`,
        e,
      );
      traceException(e);
      throw e;
    }
  };
};
