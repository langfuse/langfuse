import { randomUUID } from "crypto";
import { prisma } from "../db";
import { TraceDeleteQueue } from "./redis/traceDelete";
import { QueueJobs } from "./queues";
import { logger } from "./logger";
import { env } from "../env";

export interface TraceDeletionProcessorOptions {
  delayMs?: number; // Default from LANGFUSE_TRACE_DELETE_DELAY_MS env var
}

/**
 * Efficient trace deletion processor that batches deletions for better performance.
 *
 * This function:
 * 1. Creates a record in the pending_deletions table for each trace
 * 2. Sends a deletion event to the queue with a configurable delay
 * 3. The worker will batch delete all pending traces from ClickHouse
 * 4. Sets the is_deleted flag to true after successful deletion
 *
 * @param projectId - The project ID
 * @param traceIds - Array of trace IDs to delete
 * @param options - Configuration options including delay
 */
export async function traceDeletionProcessor(
  projectId: string,
  traceIds: string[],
  options: TraceDeletionProcessorOptions = {},
): Promise<void> {
  const { delayMs = env.LANGFUSE_TRACE_DELETE_DELAY_MS } = options;

  if (traceIds.length === 0) {
    logger.warn("traceDeletionProcessor called with empty traceIds array", {
      projectId,
    });
    return;
  }

  logger.info(
    `Processing trace deletion for ${traceIds.length} traces in project ${projectId}`,
    {
      projectId,
      traceIds,
      delayMs,
    },
  );

  try {
    // Create pending deletion records for all traces
    await prisma.pendingDeletion.createMany({
      data: traceIds.map((traceId) => ({
        projectId,
        object: "trace",
        objectId: traceId,
        isDeleted: false,
      })),
      skipDuplicates: true, // Avoid conflicts if trace is already pending deletion
    });

    // Get the trace delete queue
    const traceDeleteQueue = TraceDeleteQueue.getInstance();
    if (!traceDeleteQueue) {
      throw new Error("TraceDeleteQueue not available");
    }

    // Send deletion event with delay
    await traceDeleteQueue.add(
      QueueJobs.TraceDelete,
      {
        timestamp: new Date(),
        id: randomUUID(),
        name: QueueJobs.TraceDelete,
        payload: {
          projectId,
          traceIds,
        },
      },
      {
        delay: delayMs,
      },
    );
  } catch (error) {
    logger.error(`Failed to process trace deletion for project ${projectId}`, {
      projectId,
      traceIds,
      error,
    });
    throw error;
  }
}
