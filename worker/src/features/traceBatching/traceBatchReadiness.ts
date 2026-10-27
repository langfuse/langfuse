import { createHash } from "node:crypto";
import { getShardIndex, redis } from "@langfuse/shared/src/server";
import { env } from "../../env";

export function getTraceBatchReadinessKeys(shard: number) {
  const tag = `{trace-batch:${shard}}`;
  return { due: `${tag}:due`, state: `${tag}:state` };
}

export function getTraceBatchShard(member: string): number {
  return getShardIndex(member, env.LANGFUSE_TRACE_BATCH_SHARD_COUNT);
}

// Redis owns the clock. Include the next bucket so a boundary crossed between
// TIME and EVAL still writes into the correct bucket without a retry.
export function getTraceBatchFirstKeys(shard: number, now: number) {
  const ttl = env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS;
  const width = Math.min(3_600_000, ttl);
  const firstBucket = Math.floor((now - ttl) / width);
  const lastBucket = Math.floor(now / width) + 1;
  return {
    width,
    firstBucket,
    keys: Array.from(
      { length: lastBucket - firstBucket + 1 },
      (_, index) => `{trace-batch:${shard}}:first:${firstBucket + index}`,
    ),
  };
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

export const TRACK_SCRIPT = `
  ${EXPIRE_PENDING_SCRIPT}
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local firstTtl = tonumber(ARGV[3])
  local width = tonumber(ARGV[4])
  local bucket = math.floor(now / width)
  local current = bucket - tonumber(ARGV[5]) + 3
  if current < 3 or current > #KEYS then
    return redis.error_reply('Trace readiness bucket clock changed; retry intake')
  end
  for i = 6, #ARGV, 7 do
    local member = ARGV[i]
    local minStart = tonumber(ARGV[i + 1])
    local maxStart = tonumber(ARGV[i + 2])
    local eventUpdateCount = tonumber(ARGV[i + 4])
    local serializedEventBytes = tonumber(ARGV[i + 5])
    local identity = ARGV[i + 6]
    local previous = redis.call('HGET', KEYS[2], member)
    local state = previous and cjson.decode(previous)
    local priorDue = tonumber(redis.call('ZSCORE', KEYS[1], member))
    if not priorDue or priorDue <= now - tonumber(ARGV[2]) then state = nil end
    if state and state.historyBucket then
      local old = state.historyBucket - tonumber(ARGV[5]) + 3
      if old >= 3 and old <= #KEYS and old ~= current then
        redis.call('HDEL', KEYS[old], identity)
      end
    else
      local retainedUpdates = 0
      local retainedBytes = 0
      local estimatesKnown = true
      for key = 3, #KEYS do
        local retained = redis.call('HGET', KEYS[key], identity)
        if retained then
          local bounds = cmsgpack.unpack(retained)
          if bounds[3] > now then
            minStart = math.min(minStart, bounds[1])
            maxStart = math.max(maxStart, bounds[2])
            if bounds[4] and bounds[5] then
              retainedUpdates = math.max(retainedUpdates, bounds[4])
              retainedBytes = math.max(retainedBytes, bounds[5])
            else
              estimatesKnown = false
            end
          end
          if key ~= current then redis.call('HDEL', KEYS[key], identity) end
        end
      end
      if not estimatesKnown then
        eventUpdateCount = nil
        serializedEventBytes = nil
      elseif not state then
        eventUpdateCount = eventUpdateCount + retainedUpdates
        serializedEventBytes = serializedEventBytes + retainedBytes
      end
    end
    if state then
      minStart = math.min(minStart, state.minStart)
      maxStart = math.max(maxStart, state.maxStart)
      if eventUpdateCount and serializedEventBytes and state.eventUpdateCount and state.serializedEventBytes then
        eventUpdateCount = eventUpdateCount + state.eventUpdateCount
        serializedEventBytes = serializedEventBytes + state.serializedEventBytes
      else
        -- Missing history cannot be reconstructed from a later update.
        eventUpdateCount = nil
        serializedEventBytes = nil
      end
    end
    redis.call('HSET', KEYS[2], member, cjson.encode({
      minStart = minStart, maxStart = maxStart, revision = ARGV[i + 3], historyBucket = bucket,
      eventUpdateCount = eventUpdateCount, serializedEventBytes = serializedEventBytes
    }))
    redis.call('ZADD', KEYS[1], now + tonumber(ARGV[1]), member)
    redis.call('HSET', KEYS[current], identity,
      cmsgpack.pack({minStart, maxStart, now + firstTtl, eventUpdateCount, serializedEventBytes}))
  end
  local firstExpiry = math.max((bucket + 1) * width + firstTtl,
    redis.call('PEXPIRETIME', KEYS[current]))
  -- Integer command arguments need decimal strings, including round timestamps.
  redis.call('PEXPIREAT', KEYS[current], string.format('%.0f', firstExpiry))
  local retention = tonumber(ARGV[2])
  local expired = expirePending(now, retention, ${CLEANUP_SIZE})
  -- The shared inactivity backstop covers the latest required member deadline.
  local expiresAt = math.max(now + tonumber(ARGV[1]) + retention,
    redis.call('PEXPIRETIME', KEYS[1]), redis.call('PEXPIRETIME', KEYS[2]))
  redis.call('PEXPIREAT', KEYS[1], string.format('%.0f', expiresAt))
  redis.call('PEXPIREAT', KEYS[2], string.format('%.0f', expiresAt))
  return expired
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

// Fetch state only while it is still due for this run. Checking the score and
// reading the revision atomically prevents dispatching freshly reactivated work.
export const HYDRATE_SCRIPT = `
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local result = {}
  for i = 3, #ARGV do
    local member = ARGV[i]
    local due = tonumber(redis.call('ZSCORE', KEYS[1], member))
    if due and due <= tonumber(ARGV[1]) and due > now - tonumber(ARGV[2]) then
      local state = redis.call('HGET', KEYS[2], member)
      if state then
        table.insert(result, member)
        table.insert(result, state)
        table.insert(result, tostring(due))
      else
        redis.call('ZREM', KEYS[1], member)
      end
    end
  end
  return result
`;

// Returns one flag per member, in argument order: 1 when removed, 0 when a
// newer revision keeps the trace pending.
export const ACKNOWLEDGE_SCRIPT = `
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local width = tonumber(ARGV[2])
  local bucket = math.floor(now / width)
  local current = bucket - tonumber(ARGV[3]) + 3
  if current < 3 or current > #KEYS then
    return redis.error_reply('Trace readiness bucket clock changed; retry acknowledgement')
  end
  local removed = {}
  local retained = false
  for i = 4, #ARGV, 3 do
    local state = redis.call('HGET', KEYS[2], ARGV[i])
    local decoded = state and cjson.decode(state)
    if decoded and decoded.revision == ARGV[i + 1] then
      local identity = ARGV[i + 2]
      if decoded.historyBucket then
        local old = decoded.historyBucket - tonumber(ARGV[3]) + 3
        if old >= 3 and old <= #KEYS and old ~= current then redis.call('HDEL', KEYS[old], identity) end
      else
        for key = 3, #KEYS do
          if key ~= current then redis.call('HDEL', KEYS[key], identity) end
        end
      end
      redis.call('HSET', KEYS[current], identity,
        cmsgpack.pack({decoded.minStart, decoded.maxStart, now + tonumber(ARGV[1]), decoded.eventUpdateCount, decoded.serializedEventBytes}))
      retained = true
      redis.call('ZREM', KEYS[1], ARGV[i])
      redis.call('HDEL', KEYS[2], ARGV[i])
      table.insert(removed, 1)
    else
      table.insert(removed, 0)
    end
  end
  if retained then
    local expiresAt = math.max((bucket + 1) * width + tonumber(ARGV[1]),
      redis.call('PEXPIRETIME', KEYS[current]))
    redis.call('PEXPIREAT', KEYS[current], string.format('%.0f', expiresAt))
  end
  return removed
`;

export const readinessScriptHashes = new Map(
  [TRACK_SCRIPT, SNAPSHOT_SCRIPT, HYDRATE_SCRIPT, ACKNOWLEDGE_SCRIPT].map(
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
local bytes = 0
local entries = 0
for i = 3, #KEYS do
  bytes = bytes + (redis.call('MEMORY', 'USAGE', KEYS[i], 'SAMPLES', 5) or 0)
  entries = entries + redis.call('HLEN', KEYS[i])
end
table.insert(result, bytes)
table.insert(result, entries)
return result
`;
