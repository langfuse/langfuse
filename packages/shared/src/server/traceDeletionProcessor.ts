import { randomUUID } from "crypto";
import { prisma } from "../db";
import { TraceDeleteQueue } from "./redis/traceDelete";
import { QueueJobs } from "./queues";
import { logger } from "./logger";
import { env } from "../env";

export interface TraceDeletionProcessorOptions {
  delayMs?: number; // Default from LANGFUSE_TRACE_DELETE_DELAY_MS env var
}

export async function shouldSkipTraceDeletionFor(
  projectId: string,
  traceIds: string[],
): Promise<boolean> {
  // Check if project is in skip list
  if (env.LANGFUSE_TRACE_DELETE_SKIP_PROJECT_IDS.includes(projectId)) {
    logger.info(
      `Skipping trace deletion for project ${projectId} (in skip list). No pending deletions created, no queue job added.`,
      {
        projectId,
        traceIds,
        traceCount: traceIds.length,
        skipReason: "LANGFUSE_TRACE_DELETE_SKIP_PROJECT_IDS",
      },
    );

    return true;
  }

  // Check if project still exists (might have been deleted)
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!project) {
    logger.info(
      `Skipping trace deletion for project ${projectId} (project no longer exists). No pending deletions created, no queue job added.`,
      {
        projectId,
        traceIds,
        traceCount: traceIds.length,
        skipReason: "PROJECT_NOT_FOUND",
      },
    );

    return true;
  }

  return false;
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

  if (await shouldSkipTraceDeletionFor(projectId, traceIds)) {
    return; // Early return - don't create pending_deletions or queue job
  }

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
