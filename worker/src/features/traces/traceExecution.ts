import { createHash, randomUUID } from "node:crypto";
import {
  logger,
  redis,
  QueueJobs,
  TraceExecutionQueue,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

const TRACE_EXECUTION_DELAY_MS = 600_000;

export function traceExecutionId(projectId: string, traceId: string) {
  return createHash("sha256")
    .update(JSON.stringify([projectId, traceId]))
    .digest("hex");
}

export function isTraceExecutionEnabled(id: string): boolean {
  // A stable fraction keeps sampling consistent across workers and sample rates.
  return (
    env.LANGFUSE_OTEL_TRACE_EXECUTION_ENABLED === "true" &&
    parseInt(id.slice(0, 8), 16) / 2 ** 32 <
      env.LANGFUSE_OTEL_TRACE_EXECUTION_SAMPLE_PERCENT / 100
  );
}

/** Best-effort trace reads; scheduling failures must not fail ingestion. */
export async function scheduleTraceExecution(
  projectId: string,
  events: ReadonlyArray<{ traceId: string; startTimeISO: string }>,
): Promise<void> {
  if (
    env.LANGFUSE_OTEL_TRACE_EXECUTION_ENABLED !== "true" ||
    env.LANGFUSE_OTEL_TRACE_EXECUTION_SAMPLE_PERCENT === 0
  )
    return;

  if (!redis) return;
  const client = redis;
  try {
    const startTimes = new Map<string, { first: number; last: number }>();
    for (const event of events) {
      const start = Date.parse(event.startTimeISO);
      if (!Number.isFinite(start)) continue;
      const previous = startTimes.get(event.traceId);
      startTimes.set(event.traceId, {
        first: Math.min(previous?.first ?? start, start),
        last: Math.max(previous?.last ?? start, start),
      });
    }
    const queue = TraceExecutionQueue.getInstance();
    if (!queue) return;
    const entries = startTimes.entries();
    let done = false;
    while (!done) {
      const selected: {
        traceId: string;
        id: string;
        first: number;
        last: number;
      }[] = [];
      while (selected.length < 100) {
        const entry = entries.next();
        if (entry.done) {
          done = true;
          break;
        }
        const [traceId, times] = entry.value;
        const id = traceExecutionId(projectId, traceId);
        if (isTraceExecutionEnabled(id))
          selected.push({ traceId, id, ...times });
      }
      if (!selected.length) continue;
      // Each transaction uses one key so the map can span Redis Cluster shards.
      await Promise.all(
        selected.map(async ({ id, first }) => {
          const key = `trace-minimum:${id}`;
          const results = await client
            .multi()
            .zadd(key, "LT", first, "first_seen")
            .expire(key, 7200)
            .exec();
          if (!results)
            throw new Error("Trace minimum update returned no results");
          // EXEC may succeed while an individual command fails.
          for (const [error] of results) {
            if (error) throw error;
          }
        }),
      );
      const now = Date.now();
      await queue.addBulk(
        selected.map(({ traceId, id, last }) => ({
          name: QueueJobs.TraceExecution,
          data: {
            name: QueueJobs.TraceExecution,
            id: randomUUID(),
            timestamp: new Date(now),
            payload: { projectId, traceId, lastSeenStartTime: last },
          },
          opts: {
            delay: TRACE_EXECUTION_DELAY_MS,
            deduplication: {
              id,
              ttl: TRACE_EXECUTION_DELAY_MS,
              extend: true,
              replace: true,
            },
          },
        })),
      );
    }
  } catch (error) {
    logger.warn("Failed to schedule sampled OTel trace reads", {
      projectId,
      error,
    });
  }
}
