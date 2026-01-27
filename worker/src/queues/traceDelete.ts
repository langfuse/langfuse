import { DelayedError, Job, Processor } from "bullmq";
import {
  getCurrentSpan,
  logger,
  QueueName,
  shouldSkipTraceDeletionFor,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { processClickhouseTraceDelete } from "../features/traces/processClickhouseTraceDelete";
import { processPostgresTraceDelete } from "../features/traces/processPostgresTraceDelete";
import { env } from "../env";

const CLAIM_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export const traceDeleteProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.TraceDelete]>,
  token?: string,
): Promise<void> => {
  const projectId = job.data.payload.projectId;
  const eventTraceIds =
    "traceIds" in job.data.payload
      ? job.data.payload.traceIds
      : [job.data.payload.traceId];

  const span = getCurrentSpan();

  const [toBeDeletedTraces, pendingEventTraceIds] = await Promise.all([
    prisma.pendingDeletion.findMany({
      where: {
        projectId,
        object: "trace",
        isDeleted: false,
      },
      select: {
        objectId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.pendingDeletion.findMany({
      where: {
        projectId,
        object: "trace",
        objectId: {
          in: eventTraceIds,
        },
      },
    }),
  ]);

  // Check if any pending records were recently claimed by another job
  // A record is "claimed" only if: 1) it was updated after creation, AND 2) that update was recent
  const recentlyClaimed = toBeDeletedTraces.some(
    (t) =>
      t.createdAt.getTime() < t.updatedAt.getTime() &&
      t.updatedAt.getTime() > Date.now() - CLAIM_THRESHOLD_MS,
  );

  if (recentlyClaimed) {
    // Another job is processing these records - delay this job
    logger.debug(
      `Pending deletions for project ${projectId} were recently claimed by another job, delaying`,
    );
    await job.moveToDelayed(Date.now() + CLAIM_THRESHOLD_MS, token);
    throw new DelayedError();
  }

  // TraceIds from the event body might be deleted already or do not exist in the pending_deletions table
  // as we go live with this feature with a full trace deletion queue. At the same time, we do not want to delete
  // twice, as we might have already deleted them in a previous job and want to spare CH resources.
  // -> Filter out traces that are already deleted
  // -> Keep traces that are not in the pending_deletions table at all.
  const toBeDeletedEventTraceIds = eventTraceIds.filter(
    (traceId) =>
      !pendingEventTraceIds.some((t) => t.objectId === traceId && t.isDeleted),
  );

  // Combine valid event traces with pending deletions
  const allTraceIds = Array.from(
    new Set([
      ...toBeDeletedTraces.map((t) => t.objectId),
      ...toBeDeletedEventTraceIds,
    ]),
  );

  if (allTraceIds.length === 0) {
    logger.debug(`No traces to delete for project ${projectId}`);
    return;
  }

  logger.debug(
    `Batch deleting ${allTraceIds.length} traces for project ${projectId}`,
  );

  const traceIdsToDelete = allTraceIds.slice(0, env.LANGFUSE_DELETE_BATCH_SIZE);

  // Claim records by updating updatedAt before processing
  await prisma.pendingDeletion.updateMany({
    where: {
      projectId,
      object: "trace",
      objectId: { in: traceIdsToDelete },
      isDeleted: false,
    },
    data: { updatedAt: new Date() },
  });

  // Add all trace IDs to span attributes for observability
  if (span) {
    span.setAttribute(
      "messaging.bullmq.job.computed.totalTraceCount",
      traceIdsToDelete.length,
    );
    span.setAttribute(
      "messaging.bullmq.job.computed.eventTraceCount",
      eventTraceIds.length,
    );
    span.setAttribute(
      "messaging.bullmq.job.computed.pendingTraceCount",
      toBeDeletedTraces.length,
    );
  }

  try {
    if (await shouldSkipTraceDeletionFor(projectId, traceIdsToDelete)) {
      return;
    }

    // Delete from both Postgres and ClickHouse
    await Promise.all([
      processPostgresTraceDelete(projectId, traceIdsToDelete),
      processClickhouseTraceDelete(projectId, traceIdsToDelete),
    ]);

    // Mark only the pending traces as deleted (not the ones from the event, as they might be legacy)
    if (toBeDeletedTraces.length > 0) {
      await prisma.pendingDeletion.updateMany({
        where: {
          projectId,
          object: "trace",
          objectId: {
            in: traceIdsToDelete,
          },
          isDeleted: false,
        },
        data: {
          isDeleted: true,
        },
      });
    }

    logger.debug(
      `Successfully batch deleted ${allTraceIds.length} traces and marked them as deleted in pending_deletions table`,
    );
  } catch (error) {
    logger.error(
      `Failed to batch delete traces for project ${projectId}:`,
      error,
    );
    throw error;
  }
};
