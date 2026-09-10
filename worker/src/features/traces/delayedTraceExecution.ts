import { createHash, randomUUID } from "node:crypto";
import {
  logger,
  QueueJobs,
  DelayedTraceExecutionQueue,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

// Each chunk's keys share the BullMQ queue's Redis Cluster hash slot.
const updateMinimums = `
for i, key in ipairs(KEYS) do
  local candidate = tonumber(ARGV[i])
  local current = tonumber(redis.call('GET', key))
  redis.call('SET', key, math.min(current or candidate, candidate), 'EX', 7200)
end
return 1
`;

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
    const minimums = new Map<string, number>();
    for (const event of events) {
      if (performance.now() >= deadline)
        throw new Error("Trace read sampling exceeded 100ms");
      const start = Date.parse(event.startTimeISO);
      if (!Number.isFinite(start)) continue;
      minimums.set(
        event.traceId,
        Math.min(minimums.get(event.traceId) ?? start, start),
      );
    }
    const queue = DelayedTraceExecutionQueue.getInstance();
    if (!queue) return;
    const client = await Promise.race([queue.client, budget]);
    const entries = minimums.entries();
    let done = false;
    while (!done) {
      const selected: { traceId: string; id: string; start: number }[] = [];
      while (selected.length < 100) {
        if (performance.now() >= deadline)
          throw new Error("Trace read scheduling exceeded 100ms");
        const entry = entries.next();
        if (entry.done) {
          done = true;
          break;
        }
        const [traceId, start] = entry.value;
        const id = delayedTraceExecutionId(projectId, traceId);
        if (isDelayedTraceExecutionEnabled(id))
          selected.push({ traceId, id, start });
      }
      if (!selected.length) continue;
      await Promise.race([
        client.eval(
          updateMinimums,
          selected.length,
          ...selected.map(({ id }) => queue.toKey(`minimum:${id}`)),
          ...selected.map(({ start }) => start),
        ),
        budget,
      ]);
      if (performance.now() >= deadline)
        throw new Error("Trace read scheduling exceeded 100ms");
      const now = Date.now();
      await Promise.race([
        queue.addBulk(
          selected.map(({ traceId, id }) => ({
            name: QueueJobs.DelayedTraceExecution,
            data: {
              name: QueueJobs.DelayedTraceExecution,
              id: randomUUID(),
              timestamp: new Date(now),
              payload: { projectId, traceId, lastSeenAt: now },
            },
            opts: {
              delay: 600_000,
              deduplication: { id, ttl: 600_000, extend: true, replace: true },
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
