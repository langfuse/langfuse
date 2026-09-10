import { createHash } from "node:crypto";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import {
  createNewRedisInstance,
  logger,
  recordDistribution,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

// Redis serializes the entire script, including initialization and expiry.
// These are Redis arrival times, not observation timestamps or query bounds.
const touchTracesScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
for _, key in ipairs(KEYS) do
  redis.call('HSETNX', key, 'first_seen', now)
  local last = tonumber(redis.call('HGET', key, 'last_seen')) or 0
  redis.call('HSET', key, 'last_seen', math.max(now, last))
  redis.call('EXPIRE', key, 7200)
end
return #KEYS
`;

let client: ReturnType<typeof createNewRedisInstance> | undefined;

export function closeTraceActivityMap(): void {
  client?.disconnect();
  client = undefined;
}

/** Best-effort OTel activity measurement; never gates ingestion on Redis health. */
export async function recordTraceActivity(
  projectId: string,
  traceIds: string[],
): Promise<void> {
  if (
    env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_ENABLED !== "true" ||
    env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_SAMPLE_PERCENT === 0 ||
    traceIds.length === 0
  ) {
    return;
  }

  const startedAt = performance.now();
  try {
    const samplePercent = env.LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_SAMPLE_PERCENT;
    const distinctTraceIds = [...new Set(traceIds)].filter((traceId) => {
      if (samplePercent === 100) return true;
      // Stable across workers, retries, and batches. Increasing the threshold
      // retains the existing sample. JSON encoding keeps the pair unambiguous.
      const hash = createHash("sha256")
        .update(JSON.stringify([projectId, traceId]))
        .digest()
        .readUInt32BE(0);
      return hash / 2 ** 32 < samplePercent / 100;
    });
    if (distinctTraceIds.length === 0) return;

    // A separate connection bounds failures without changing BullMQ's retries.
    client ??= createNewRedisInstance({
      keyPrefix: sharedEnv.REDIS_KEY_PREFIX ?? undefined,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 1000,
    });
    // Also avoid the cluster-level offline queue during startup/reconnect.
    if (!client || client.status !== "ready") {
      recordIncrement("langfuse.ingestion.otel.activity_map.skipped_batches");
      return;
    }

    // All keys in a call share a project hash tag for Redis Cluster. Bound
    // script work to avoid blocking Redis for a large OTel batch.
    for (let offset = 0; offset < distinctTraceIds.length; offset += 100) {
      if (client.status !== "ready") {
        recordIncrement("langfuse.ingestion.otel.activity_map.skipped_batches");
        return;
      }
      const keys = distinctTraceIds
        .slice(offset, offset + 100)
        .map((traceId) => `langfuse:otel:activity:{${projectId}}:${traceId}`);
      await client.eval(touchTracesScript, keys.length, ...keys);
      recordIncrement(
        "langfuse.ingestion.otel.activity_map.trace_updates",
        keys.length,
      );
    }
  } catch (error) {
    recordIncrement("langfuse.ingestion.otel.activity_map.errors");
    logger.warn("Failed to record OTel trace activity", { projectId, error });
  } finally {
    recordDistribution(
      "langfuse.ingestion.otel.activity_map.duration_ms",
      performance.now() - startedAt,
    );
  }
}
