import { createHash, randomUUID } from "node:crypto";
import {
  logger,
  QueueJobs,
  DelayedTraceExecutionQueue,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

const TRACE_EXECUTION_DELAY_MS = 600_000;

export function delayedTraceExecutionId(projectId: string, traceId: string) {
  return createHash("sha256")
    .update(JSON.stringify([projectId, traceId]))
    .digest("hex");
}

export function isDelayedTraceExecutionEnabled(id: string): boolean {
  return (
    env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_ENABLED === "true" &&
    parseInt(id.slice(0, 8), 16) / 2 ** 32 <
      env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_SAMPLE_PERCENT / 100
  );
}

/** Best-effort experiment: no more than 100ms of additional ingestion wait. */
export async function scheduleDelayedTraceExecution(
  projectId: string,
  events: ReadonlyArray<{ traceId: string; startTimeISO: string }>,
): Promise<void> {
  if (
    env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_ENABLED !== "true" ||
    env.LANGFUSE_OTEL_DELAYED_TRACE_EXECUTION_SAMPLE_PERCENT === 0
  )
    return;

  const deadline = performance.now() + 100;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const budget = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Trace read scheduling exceeded 100ms")),
        100,
      );
    });
    const startTimes = new Map<string, { first: number; last: number }>();
    for (const event of events) {
      if (performance.now() >= deadline)
        throw new Error("Trace read sampling exceeded 100ms");
      const start = Date.parse(event.startTimeISO);
      if (!Number.isFinite(start)) continue;
      const previous = startTimes.get(event.traceId);
      startTimes.set(event.traceId, {
        first: Math.min(previous?.first ?? start, start),
        last: Math.max(previous?.last ?? start, start),
      });
    }
    const queue = DelayedTraceExecutionQueue.getInstance();
    if (!queue) return;
    const client = await Promise.race([queue.client, budget]);
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
        if (performance.now() >= deadline)
          throw new Error("Trace read scheduling exceeded 100ms");
        const entry = entries.next();
        if (entry.done) {
          done = true;
          break;
        }
        const [traceId, times] = entry.value;
        const id = delayedTraceExecutionId(projectId, traceId);
        if (isDelayedTraceExecutionEnabled(id))
          selected.push({ traceId, id, ...times });
      }
      if (!selected.length) continue;
      // Atomic per trace; refresh expiry even when the minimum is unchanged.
      const pipeline = client.pipeline(
        selected.flatMap(({ id, first }) => {
          const key = queue.toKey(`minimum-zset:${id}`);
          return [
            ["multi"],
            ["zadd", key, "LT", first, "first_seen"],
            ["expire", key, 7200],
            ["exec"],
          ];
        }),
      );
      const results = await Promise.race([pipeline.exec(), budget]);
      if (!results) throw new Error("Trace minimum update returned no results");
      for (const [error, reply] of results) {
        if (error) throw error;
        // EXEC can succeed while a command inside the transaction fails.
        if (Array.isArray(reply)) {
          for (const result of reply) {
            if (result instanceof Error) throw result;
          }
        }
      }
      if (performance.now() >= deadline)
        throw new Error("Trace read scheduling exceeded 100ms");
      const now = Date.now();
      await Promise.race([
        queue.addBulk(
          selected.map(({ traceId, id, last }) => ({
            name: QueueJobs.DelayedTraceExecution,
            data: {
              name: QueueJobs.DelayedTraceExecution,
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
        ),
        budget,
      ]);
    }
  } catch (error) {
    // An already submitted chunk may still finish; never submit more after timeout.
    logger.warn("Failed to schedule sampled OTel trace reads", {
      projectId,
      error,
    });
  } finally {
    clearTimeout(timer);
  }
}
