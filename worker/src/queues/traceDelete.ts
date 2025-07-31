import { Job, Processor } from "bullmq";
import {
  getCurrentSpan,
  logger,
  QueueName,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { processClickhouseTraceDelete } from "../features/traces/processClickhouseTraceDelete";
import { processPostgresTraceDelete } from "../features/traces/processPostgresTraceDelete";

export const traceDeleteProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.TraceDelete]>,
): Promise<void> => {
  const projectId = job.data.payload.projectId;
  const eventTraceIds =
    "traceIds" in job.data.payload
      ? job.data.payload.traceIds
      : [job.data.payload.traceId];

  const span = getCurrentSpan();

  // Fetch all pending trace deletions for this project
  const pendingDeletions = await prisma.pendingDeletion.findMany({
    where: {
      projectId,
      object: "trace",
      isDeleted: false,
    },
    select: {
      objectId: true,
    },
  });

  // Combine traces from the event with all pending deletions
  const pendingTraceIds = pendingDeletions.map((p) => p.objectId);
  const allTraceIds = Array.from(
    new Set([...eventTraceIds, ...pendingTraceIds]),
  );

  if (allTraceIds.length === 0) {
    logger.debug(`No traces to delete for project ${projectId}`);
    return;
  }

  logger.debug(
    `Batch deleting ${allTraceIds.length} traces for project ${projectId} (${eventTraceIds.length} from event, ${pendingTraceIds.length} pending)`,
  );

  // Add all trace IDs to span attributes for observability
  if (span) {
    span.setAttribute(
      "messaging.bullmq.job.computed.totalTraceCount",
      allTraceIds.length,
    );
    span.setAttribute(
      "messaging.bullmq.job.computed.eventTraceCount",
      eventTraceIds.length,
    );
    span.setAttribute(
      "messaging.bullmq.job.computed.pendingTraceCount",
      pendingTraceIds.length,
    );
  }

  try {
    // Delete from both Postgres and ClickHouse
    await Promise.all([
      processPostgresTraceDelete(projectId, allTraceIds),
      processClickhouseTraceDelete(projectId, allTraceIds),
    ]);

    // Mark only the pending traces as deleted (not the ones from the event, as they might be legacy)
    if (pendingTraceIds.length > 0) {
      await prisma.pendingDeletion.updateMany({
        where: {
          projectId,
          object: "trace",
          objectId: {
            in: pendingTraceIds,
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
