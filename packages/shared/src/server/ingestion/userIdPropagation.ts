import { prisma } from "../../db";
import { logger } from "../logger";
import { traceException } from "../instrumentation";
import { eventTypes, type IngestionEventType } from "./types";

/**
 * Propagate userId from traces to child events using hybrid approach.
 * First try in-memory propagation from traces in current batch, then DB lookup if needed.
 */
export async function propagateTraceUserIds(
  batch: IngestionEventType[],
  projectId: string,
): Promise<void> {
  // Build in-memory map from traces in current batch
  const batchTraceUserIdMap = new Map<string, string>();

  batch.forEach((event) => {
    if (
      event.type === eventTypes.TRACE_CREATE &&
      event.body.userId &&
      event.body.id
    ) {
      batchTraceUserIdMap.set(event.body.id, event.body.userId);
    }
  });

  // Identify events needing propagation
  const needsPropagation: IngestionEventType[] = [];
  const needsDbLookup = new Set<string>();

  batch.forEach((event) => {
    if ("traceId" in event.body && event.body.traceId && !event.body.userId) {
      const batchUserId = batchTraceUserIdMap.get(event.body.traceId);
      if (batchUserId) {
        // Propagate from current batch
        event.body.userId = batchUserId;
      } else {
        // Need DB lookup for trace not in current batch
        needsPropagation.push(event);
        needsDbLookup.add(event.body.traceId);
      }
    }
  });

  // DB lookup only if needed
  if (needsDbLookup.size === 0) return;

  try {
    const tracesWithUserId = await prisma.legacyPrismaTrace.findMany({
      where: {
        id: { in: Array.from(needsDbLookup) },
        projectId,
        userId: { not: null },
      },
      select: { id: true, userId: true },
    });

    const dbTraceUserIdMap = new Map(
      tracesWithUserId.map((trace) => [trace.id, trace.userId!]),
    );

    // Propagate from DB lookup
    needsPropagation.forEach((event) => {
      if ("traceId" in event.body && event.body.traceId) {
        const userId = dbTraceUserIdMap.get(event.body.traceId);
        if (userId) {
          event.body.userId = userId;
        }
      }
    });
  } catch (error) {
    traceException(error);
    logger.error("Failed to propagate user IDs from database lookup", {
      projectId,
      error,
      traceIds: Array.from(needsDbLookup),
    });
    // Don't throw - degraded functionality is better than complete failure
  }
}
