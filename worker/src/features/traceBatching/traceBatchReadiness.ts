import { createHash } from "node:crypto";
import {
  getShardIndex,
  getTracingReadinessSettings,
  logger,
  recordIncrement,
  redis,
} from "@langfuse/shared/src/server";
import { traceDispatchConfig } from "../eventsDispatch/config";

export function getTraceBatchShard(member: string): number {
  return getShardIndex(member, traceDispatchConfig.shardCount);
}

/** Resolve the project's idle interval consistently for both trace writers. */
export async function resolveTraceIdleMs(projectId: string): Promise<number> {
  let traceIdleMs: number | null = null;
  try {
    ({ traceIdleMs } = await getTracingReadinessSettings(projectId));
  } catch (error) {
    recordIncrement("langfuse.trace_dispatch.idle_time_read_failures", 1);
    logger.warn("Failed to read trace idle time, using the default", {
      projectId,
      error,
    });
  }
  if (traceIdleMs === null) return traceDispatchConfig.defaultIdleMs;
  // Limit configured project idle time to the pending window minus one dispatch interval.
  const cap =
    traceDispatchConfig.pendingTtlMs - traceDispatchConfig.dispatchIntervalMs;
  return cap > 0 ? Math.min(traceIdleMs, cap) : traceIdleMs;
}

// A fixed 128-bit identity keeps arbitrary project/trace identifiers out of the
// retained map. Due/state keep the full identifiers for dispatch.
export function getTraceBatchFirstMember(member: string): Buffer {
  return createHash("sha256").update(member).digest().subarray(0, 16);
}

export const CLEANUP_SIZE = 100;

// Retain traces for a bounded time after readiness. Reuse the due index so
// cleanup needs no full hash scan. Whole-key expiry is an inactivity backstop.
const EXPIRE_PENDING_SCRIPT = `
  local function expirePending(now, retention, limit)
    local expired = redis.call('ZRANGE', KEYS[1], '-inf', now - retention,
      'BYSCORE', 'LIMIT', 0, limit)
    for _, member in ipairs(expired) do
      redis.call('ZREM', KEYS[1], member)
      redis.call('HDEL', KEYS[2], member)
    end
    return #expired
  end
`;

// Cleanup stays bounded even when the dispatcher has accumulated a backlog.
// Keep the first Redis timestamp as the cutoff throughout this run.
export const SNAPSHOT_SCRIPT = `
  ${EXPIRE_PENDING_SCRIPT}
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local retention = tonumber(ARGV[1])
  local cutoff = tonumber(ARGV[2]) or now
  local expired = expirePending(now, retention, ${CLEANUP_SIZE})
  local pending = redis.call('ZCARD', KEYS[1])
  local ready = math.max(0, redis.call('ZCOUNT', KEYS[1], '-inf', cutoff)
    - redis.call('ZCOUNT', KEYS[1], '-inf', now - retention))
  local first = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {now, cutoff, pending, ready, first[2] or tostring(now), expired}
`;

const readinessScriptHashes = new Map(
  [SNAPSHOT_SCRIPT].map(
    (script) =>
      [script, createHash("sha1").update(script).digest("hex")] as const,
  ),
);

export async function evalReadiness(
  script: string,
  keys: string[],
  args: (string | number | Buffer)[],
): Promise<unknown> {
  if (!redis) throw new Error("Trace batching requires Redis");
  try {
    return await redis.evalsha(
      readinessScriptHashes.get(script)!,
      keys.length,
      ...keys,
      ...args,
    );
  } catch (error) {
    // SCRIPT FLUSH or a promoted primary can have an empty script cache.
    if (!(error instanceof Error) || !error.message.startsWith("NOSCRIPT"))
      throw error;
    return redis.eval(script, keys.length, ...keys, ...args);
  }
}

// EVAL applies the shared client's key prefix and routes keys to their
// cluster slot. Raw MEMORY commands do not identify keys in ioredis metadata.
export const MEMORY_SCRIPT = `
local result = {
  redis.call('MEMORY', 'USAGE', KEYS[1], 'SAMPLES', 5) or 0,
  redis.call('ZCARD', KEYS[1]),
  redis.call('MEMORY', 'USAGE', KEYS[2], 'SAMPLES', 5) or 0,
  redis.call('HLEN', KEYS[2])
}
return result
`;
