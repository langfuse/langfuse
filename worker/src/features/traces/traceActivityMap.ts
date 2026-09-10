import { createHash } from "node:crypto";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { createNewRedisInstance, logger } from "@langfuse/shared/src/server";
import { env } from "../../env";

// Redis serializes initialization, update, and expiry. These are arrival
// timestamps, not observation timestamps or ClickHouse query bounds.
const touchTracesScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
for _, key in ipairs(KEYS) do
  redis.call('HSETNX', key, 'first_seen', now)
  local last = tonumber(redis.call('HGET', key, 'last_seen')) or 0
  redis.call('HSET', key, 'last_seen', math.max(now, last))
  redis.call('EXPIRE', key, 7200)
end
return 1
`;

let client: ReturnType<typeof createNewRedisInstance> | undefined;

export function closeTraceActivityMap(): void {
  client?.disconnect();
  client = undefined;
}

/** Best-effort OTel activity sampling with a 100ms budget per call. */
export async function recordTraceActivity(
  projectId: string,
  traceIds: string[],
): Promise<void> {
  const samplePercent = env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_SAMPLE_PERCENT;
  if (
    env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_ENABLED !== "true" ||
    samplePercent === 0 ||
    traceIds.length === 0
  ) {
    return;
  }

  const deadline = performance.now() + 100;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Separate from BullMQ; skip startup/reconnect rather than queueing writes.
    if (client === undefined) {
      client = createNewRedisInstance({
        keyPrefix: sharedEnv.REDIS_KEY_PREFIX ?? undefined,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        commandTimeout: 100,
      });
    }
    if (!client || client.status !== "ready") return;

    const budgetExpired = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error("OTel trace activity map deadline exceeded")),
        Math.max(0, deadline - performance.now()),
      );
    });
    const seen = new Set<string>();
    let offset = 0;
    while (offset < traceIds.length) {
      const keys: string[] = [];
      while (offset < traceIds.length && keys.length < 100) {
        // Bound sampling too, without first copying/deduplicating a huge batch.
        if (performance.now() >= deadline) return;
        const traceId = traceIds[offset++];
        if (seen.has(traceId)) continue;
        seen.add(traceId);
        if (samplePercent < 100) {
          // Stable across batches/retries; increasing the threshold retains
          // existing traces. JSON encoding keeps the project/trace unambiguous.
          const hash = createHash("sha256")
            .update(JSON.stringify([projectId, traceId]))
            .digest()
            .readUInt32BE(0);
          if (hash / 2 ** 32 >= samplePercent / 100) continue;
        }
        keys.push(`langfuse:otel:activity:{${projectId}}:${traceId}`);
      }
      if (performance.now() >= deadline || client.status !== "ready") return;
      if (keys.length === 0) continue;
      // Each script is bounded and all keys share a Redis Cluster slot.
      // Race only this command: on timeout no remaining chunks are submitted.
      // A command already sent to Redis may still apply after we stop waiting.
      await Promise.race([
        client.eval(touchTracesScript, keys.length, ...keys),
        budgetExpired,
      ]);
    }
  } catch (error) {
    logger.warn("Failed to record OTel trace activity", { projectId, error });
  } finally {
    clearTimeout(timeout);
  }
}
