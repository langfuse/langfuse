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
  markProjectIngestFailure,
  markProjectS3Slowdown,
  QueueName,
  rawEventBucketPrefix,
  recordDistribution,
  recordHistogram,
  recordIncrement,
  redis,
  SecondaryIngestionQueue,
  TQueueJobTypes,
  traceException,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { env, v4WritesToEventsTable } from "../env";
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

      // Prefer the producer-supplied bucket prefix so writer and reader
      // never disagree, even if `LANGFUSE_S3_EVENT_KEY_MAX_SEGMENT_BYTES`
      // (or other env values that feed the key) drifts between web and
      // worker. Fall back to local reconstruction for in-flight jobs that
      // predate the payload field (rolling deploy).
      //
      // The fallback uses `rawEventBucketPrefix` because the producer that
      // enqueued without a `bucketPrefix` field is the pre- sanitization
      // code path, which wrote S3 with verbatim `${eventBodyId}` interpolation.
      // The queue-payload `eventBodyId` is therefore the literal S3-side segment.
      const bucketPrefix =
        job.data.payload.data.bucketPrefix ??
        rawEventBucketPrefix({
          projectId: job.data.payload.authCheck.scope.projectId,
          entityType: getClickhouseEntityType(job.data.payload.data.type),
          rawEntityIdSegment: job.data.payload.data.eventBodyId,
        });

      // If fileKey was processed within the last minutes, i.e. has a match in redis, we skip processing.
      // `eventBodyId` is the raw (un-sanitized) ID; for legacy pre-fix data
      // it may contain "/" which is unusual but valid in a Redis key.
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
      const projectId = job.data.payload.authCheck.scope.projectId;
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
        const shardingKey = `${projectId}-${job.data.payload.data.eventBodyId}`;
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

      // Download all events from folder into a local array
      const clickhouseEntityType = getClickhouseEntityType(
        job.data.payload.data.type,
      );

      let eventFiles: { file: string; createdAt: Date }[] = [];
      const events: IngestionEventType[] = [];

      // Check if we should skip S3 list operation
      const shouldSkipS3List =
        // The producer sets skipS3List to true if it's an OTel observation
        job.data.payload.data.skipS3List && job.data.payload.data.fileKey;
      const s3Prefix = bucketPrefix;

      let totalS3DownloadSizeBytes = 0;

      if (shouldSkipS3List) {
        // Direct file download - skip S3 list operation
        const filePath = `${s3Prefix}${job.data.payload.data.fileKey}.json`;
        eventFiles = [{ file: filePath, createdAt: new Date() }];

        const file = await s3Client.download(filePath);
        const fileSize = file.length;

        recordHistogram("langfuse.ingestion.s3_file_size_bytes", fileSize, {
          skippedS3List: "true",
        });
        totalS3DownloadSizeBytes += fileSize;

        const parsedFile = JSON.parse(file);
        events.push(...(Array.isArray(parsedFile) ? parsedFile : [parsedFile]));
      } else {
        eventFiles = await s3Client.listFiles(s3Prefix);

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
          `No events found for project ${job.data.payload.authCheck.scope.projectId} and event ${job.data.payload.data.eventBodyId}`,
        );
        return;
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
                  `langfuse:ingestion:recently-processed:${job.data.payload.authCheck.scope.projectId}:${job.data.payload.data.type}:${job.data.payload.data.eventBodyId}:${key.replace(".json", "")}`,
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
        v4WritesToEventsTable(env);

      // Recover the canonical entity id from the downloaded event body, not
      // from the queue payload. On replay, `payload.data.eventBodyId` is the
      // literal S3-side segment (sanitized + hashed for any post-PR write
      // where safeBlobKeySegment fired); using it as the ClickHouse row id
      // would write a divergent row. `event.body.id` is the raw SDK id that
      // the original producer stored, so it always matches normal-ingest's
      // row id. The producer's reducer in `processEventBatch.ts` filters out
      // events without `body.id`, so this is non-null in practice; the
      // fallback handles any defensive edge case.
      const canonicalEntityId =
        events[0].body?.id ?? job.data.payload.data.eventBodyId;

      if (
        env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG === "true" &&
        job.data.payload.data.fileKey
      ) {
        const fileName = `${job.data.payload.data.fileKey}.json`;
        clickhouseWriter.addToQueue(TableName.BlobStorageFileLog, {
          id: randomUUID(),
          project_id: job.data.payload.authCheck.scope.projectId,
          entity_type: clickhouseEntityType,
          entity_id: canonicalEntityId,
          event_id: job.data.payload.data.fileKey,
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: `${bucketPrefix}${fileName}`,
          created_at: new Date().getTime(),
          updated_at: new Date().getTime(),
          event_ts: new Date().getTime(),
          is_deleted: 0,
        });
      }

      await new IngestionService(
        redis,
        prisma,
        clickhouseWriter,
        clickhouseClient(),
      ).mergeAndWrite(
        getClickhouseEntityType(events[0].type),
        job.data.payload.authCheck.scope.projectId,
        canonicalEntityId,
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
        markProjectIngestFailure(projectId, {
          source: "ingestion_queue",
          reason: "s3_slowdown",
        });
      } else {
        markProjectIngestFailure(job.data.payload.authCheck.scope.projectId, {
          source: "ingestion_queue",
          reason: "processing_error",
        });
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
