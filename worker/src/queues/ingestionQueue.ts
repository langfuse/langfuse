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
  parseRawEventHistory,
  QueueName,
  readRawEventsForEntity,
  recordDistribution,
  recordIncrement,
  redis,
  SecondaryIngestionQueue,
  TQueueJobTypes,
  traceException,
} from "@langfuse/shared/src/server";
import { chunk } from "lodash";
import { prisma } from "@langfuse/shared/src/db";

import { env, v4WritesToEventsTable } from "../env";
import { IngestionService } from "../services/IngestionService";
import { ClickhouseWriter, TableName } from "../services/ClickhouseWriter";
import { GreptimeWriter } from "../services/GreptimeWriter";
import { randomUUID } from "crypto";

/**
 * Backward-compat S3 read for jobs produced before the GreptimeDB raw_events flip. Mirrors the
 * original S3 event-store read path so in-flight / old-queue jobs are not dropped during a rolling
 * deploy (the new producer writes raw_events; an old job only has S3 files). The full per-entity
 * S3 history is returned, so the downstream rebuildFromHistory merge behaves identically.
 * Remove once the old ingestion queue has fully drained.
 */
async function readEventsFromS3Fallback(params: {
  projectId: string;
  entityType: string;
  entityId: string;
  fileKey?: string;
  skipS3List?: boolean;
}): Promise<{ events: IngestionEventType[]; firstWriteTimeMs: number }> {
  const s3Client = getS3EventStorageClient(env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET);
  const s3Prefix = `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${params.projectId}/${params.entityType}/${params.entityId}/`;
  const events: IngestionEventType[] = [];
  let firstWriteTimeMs = Date.now();

  if (params.skipS3List && params.fileKey) {
    const file = await s3Client.download(`${s3Prefix}${params.fileKey}.json`);
    const parsed = JSON.parse(file);
    events.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    return { events, firstWriteTimeMs };
  }

  const eventFiles = await s3Client.listFiles(s3Prefix);
  if (eventFiles.length > 0) {
    firstWriteTimeMs =
      eventFiles.map((f) => f.createdAt.getTime()).sort((a, b) => a - b)[0] ??
      firstWriteTimeMs;
  }
  const batches = chunk(eventFiles, env.LANGFUSE_S3_CONCURRENT_READS);
  for (const batch of batches) {
    const batchEvents = await Promise.all(
      batch.map(async (fileRef) => {
        const file = await s3Client.download(fileRef.file);
        const parsed = JSON.parse(file);
        return Array.isArray(parsed) ? parsed : [parsed];
      }),
    );
    events.push(...batchEvents.flat());
  }
  return { events, firstWriteTimeMs };
}

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

      if (
        env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG === "true" &&
        job.data.payload.data.fileKey &&
        job.data.payload.data.fileKey
      ) {
        const fileName = `${job.data.payload.data.fileKey}.json`;
        clickhouseWriter.addToQueue(TableName.BlobStorageFileLog, {
          id: randomUUID(),
          project_id: job.data.payload.authCheck.scope.projectId,
          entity_type: getClickhouseEntityType(job.data.payload.data.type),
          entity_id: job.data.payload.data.eventBodyId,
          event_id: job.data.payload.data.fileKey,
          bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          bucket_path: `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${job.data.payload.authCheck.scope.projectId}/${getClickhouseEntityType(job.data.payload.data.type)}/${job.data.payload.data.eventBodyId}/${fileName}`,
          created_at: new Date().getTime(),
          updated_at: new Date().getTime(),
          event_ts: new Date().getTime(),
          is_deleted: 0,
        });
      }

      // Batch-level seen-cache: if this batch for this entity was processed within the last
      // minutes, skip the redundant rebuild. Keyed on batchId (falls back to fileKey for in-flight
      // S3-era jobs). The full-history rebuild is idempotent, so this is an optimization, not a
      // correctness guard.
      const seenToken =
        job.data.payload.data.batchId ?? job.data.payload.data.fileKey;
      if (
        env.LANGFUSE_ENABLE_REDIS_SEEN_EVENT_CACHE === "true" &&
        redis &&
        seenToken
      ) {
        const key = `langfuse:ingestion:recently-processed:${job.data.payload.authCheck.scope.projectId}:${job.data.payload.data.type}:${job.data.payload.data.eventBodyId}:${seenToken}`;
        const exists = await redis.exists(key);
        if (exists) {
          recordIncrement("langfuse.ingestion.recently_processed_cache", 1, {
            type: job.data.payload.data.type,
            skipped: "true",
          });
          logger.debug(
            `Skipping already-processed batch ${seenToken} for project ${job.data.payload.authCheck.scope.projectId}`,
          );
          return;
        }
        recordIncrement("langfuse.ingestion.recently_processed_cache", 1, {
          type: job.data.payload.data.type,
          skipped: "false",
        });
        // NOTE: the seen key is set only AFTER a successful merge below — not here. Setting it
        // before the secondary-queue redirect would make the redirected job's reprocessing hit
        // the key and silently skip, dropping the entity.
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

      logger.debug(
        `Processing ingestion event ${
          enableRedirectToSecondaryQueue ? "" : "secondary"
        }`,
        {
          projectId: job.data.payload.authCheck.scope.projectId,
          payload: job.data.payload.data,
        },
      );

      // GreptimeDB primary path (02-write-path.md, decision 2): rebuild the entity snapshot from
      // its full raw_events history instead of downloading per-invocation S3 files. Out-of-order
      // delivery resolves naturally because every write replays the complete, deterministically
      // sorted history from scratch. `projectId` is already in scope from the redirect check above.
      const entityId = job.data.payload.data.eventBodyId;
      const clickhouseEntityType = getClickhouseEntityType(
        job.data.payload.data.type,
      );

      const rawRows = await readRawEventsForEntity({
        projectId,
        entityType: clickhouseEntityType,
        entityId,
      });
      let { events, minIngestedAtMs, deleted } = parseRawEventHistory(rawRows);

      // Backward-compat: an old S3-era job has no raw_events rows yet. Fall back to the S3 event
      // store so a rolling deploy doesn't drop in-flight jobs (see readEventsFromS3Fallback).
      if (events.length === 0 && job.data.payload.data.fileKey) {
        const fallback = await readEventsFromS3Fallback({
          projectId,
          entityType: clickhouseEntityType,
          entityId,
          fileKey: job.data.payload.data.fileKey,
          skipS3List: job.data.payload.data.skipS3List,
        });
        events = fallback.events;
        minIngestedAtMs = fallback.firstWriteTimeMs;
        if (events.length > 0) {
          recordIncrement("langfuse.ingestion.s3_fallback", events.length, {
            kind: clickhouseEntityType,
          });
        }
      }

      // Number of (deduped) events replayed per rebuild. Renamed from the old
      // "count_files_distribution" S3-file metric, whose semantics no longer apply.
      recordDistribution(
        "langfuse.ingestion.rebuild_event_count_distribution",
        events.length,
        { kind: clickhouseEntityType },
      );
      span?.setAttribute("langfuse.ingestion.event.kind", clickhouseEntityType);
      span?.setAttribute("langfuse.ingestion.raw_events_count", rawRows.length);

      if (events.length === 0) {
        logger.warn(
          `No events found for project ${projectId} and entity ${entityId}`,
        );
        return;
      }

      // Perform merge of those events
      if (!redis) throw new Error("Redis not available");
      if (!prisma) throw new Error("Prisma not available");

      // Determine whether to forward to staging events table
      // Use explicit flag from job payload if provided, otherwise fall back to env flags
      const forwardToEventsTable =
        job.data.payload.data.forwardToEventsTable ??
        v4WritesToEventsTable(env);

      await new IngestionService(
        redis,
        prisma,
        clickhouseWriter,
        clickhouseClient(),
        GreptimeWriter.getInstance(),
        // rebuildFromHistory: skip the ClickHouse baseline read so the merge replays the full
        // raw_events history from an empty snapshot. created_at = min(ingested_at).
        true,
      ).mergeAndWrite(
        clickhouseEntityType,
        projectId,
        entityId,
        new Date(minIngestedAtMs),
        events,
        forwardToEventsTable,
        deleted,
      );

      // Mark this batch seen only after a successful merge, so a redirected or retried job is
      // never skipped before it actually wrote. The rebuild is idempotent, so a duplicate that
      // races past the check above merely costs one extra (harmless) rebuild.
      if (
        env.LANGFUSE_ENABLE_REDIS_SEEN_EVENT_CACHE === "true" &&
        redis &&
        seenToken
      ) {
        const key = `langfuse:ingestion:recently-processed:${projectId}:${job.data.payload.data.type}:${entityId}:${seenToken}`;
        await redis
          .set(key, "1", "EX", 60 * 5)
          .catch((e) =>
            logger.warn(`Failed to set seen-cache for batch ${seenToken}`, e),
          );
      }
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
