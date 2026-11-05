import { createHash, randomUUID } from "node:crypto";
import { redis } from "@langfuse/shared/src/server";
import { env } from "../../env";
import {
  getTraceBatchFirstMember,
  getTraceBatchShard,
  resolveTraceIdleMs,
} from "./traceBatchReadiness";

const REDIS_BATCH_SIZE = 50;
const CLEANUP_SIZE = 100;
const shardTags = new Map<number, string>();

function getTraceDispatchShardTag(shard: number): string {
  const cached = shardTags.get(shard);
  if (cached !== undefined) return cached;

  const suffix = createHash("sha256")
    .update(`trace-dispatch:v2:${shard}`)
    .digest("hex")
    .slice(0, 16);
  const tag = `{trace-dispatch:v2:${shard}:${suffix}}`;
  shardTags.set(shard, tag);
  return tag;
}

export function getRecordingKeys(shard: number) {
  const tag = getTraceDispatchShardTag(shard);
  return {
    record: `${tag}:record`,
    due: `${tag}:due`,
  };
}

// Include the next hour in case Redis crosses a bucket boundary before EVAL.
export function getRecordingBoundsKeys(shard: number, now: number) {
  const tag = getTraceDispatchShardTag(shard);
  const ttl = env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS;
  const width = Math.min(3_600_000, ttl);
  const firstBucket = Math.floor((now - ttl) / width);
  const lastBucket = Math.floor(now / width) + 1;
  return {
    width,
    firstBucket,
    keys: Array.from(
      { length: lastBucket - firstBucket + 1 },
      (_, index) => `${tag}:bounds:${firstBucket + index}`,
    ),
  };
}

const EXPIRE_PENDING_SCRIPT = `
  local function expirePending(recordKey, dueKey, now, retention)
    local expired = redis.call('ZRANGE', dueKey, '-inf', now - retention,
      'BYSCORE', 'LIMIT', 0, ${CLEANUP_SIZE})
    for _, member in ipairs(expired) do
      redis.call('HDEL', recordKey, member)
      redis.call('ZREM', dueKey, member)
    end
    return #expired
  end
`;

const RECORD_SCRIPT = `
  ${EXPIRE_PENDING_SCRIPT}
  local recordKey, dueKey = KEYS[1], KEYS[2]
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  -- Readiness uses recording time plus idle interval, not the spans' start times.
  local due = now + tonumber(ARGV[1])
  local boundsTtl = tonumber(ARGV[2])
  local pendingTtl = tonumber(ARGV[3])
  local width, firstBucket = tonumber(ARGV[4]), tonumber(ARGV[5])
  local current = math.floor(now / width) - firstBucket + 3
  if current < 3 or current > #KEYS then
    return redis.error_reply('Trace recording bucket clock changed; retry intake')
  end
  local wroteRecord = false
  for i = 6, #ARGV, 7 do
    local member = ARGV[i]
    local minStart = tonumber(ARGV[i + 1])
    local maxStart = tonumber(ARGV[i + 2])
    local incomingRules = cjson.decode(ARGV[i + 4])
    local serializedEventBytes = tonumber(ARGV[i + 5])
    local boundsIdentity = ARGV[i + 6]

    -- 1. Merge bounds for all activity and move them to the current bucket.
    local boundsIndex, previousBounds = current, nil
    for key = #KEYS, 3, -1 do
      previousBounds = redis.call('HGET', KEYS[key], boundsIdentity)
      if previousBounds then boundsIndex = key; break end
    end
    if previousBounds then
      local bounds = cmsgpack.unpack(previousBounds)
      minStart = math.min(minStart, bounds[1])
      maxStart = math.max(maxStart, bounds[2])
      serializedEventBytes = serializedEventBytes + bounds[3]
    end
    redis.call('HSET', KEYS[current], boundsIdentity, cmsgpack.pack({
      minStart, maxStart, serializedEventBytes
    }))
    if boundsIndex ~= current then redis.call('HDEL', KEYS[boundsIndex], boundsIdentity) end

    -- 2. Merge pending selections; discard expired or incomplete state.
    local previousRecord = redis.call('HGET', recordKey, member)
    local record = previousRecord and cjson.decode(previousRecord)
    local priorDue = tonumber(redis.call('ZSCORE', dueKey, member))
    if (record or priorDue) and (not previousBounds or not priorDue or priorDue + pendingTtl <= now) then
      record = nil
      redis.call('HDEL', recordKey, member)
      redis.call('ZREM', dueKey, member)
    end
    if record or #incomingRules > 0 then
      local rules = {}
      local seen = {}
      for _, id in ipairs(record and record.rules or {}) do
        if not seen[id] then table.insert(rules, id); seen[id] = true end
      end
      for _, id in ipairs(incomingRules) do
        if not seen[id] then table.insert(rules, id); seen[id] = true end
      end
      redis.call('HSET', recordKey, member, cjson.encode({
        revision = ARGV[i + 3], rules = rules,
        failed_cnt = record and record.failed_cnt or 0
      }))
      -- 3. Postpone pending traces on every arrival, including nonmatches.
      redis.call('ZADD', dueKey, due, member)
      wroteRecord = true
    end
  end
  -- Set the shared bucket's expiry once per batch.
  local boundsExpiry = (firstBucket + current - 2) * width + boundsTtl
  redis.call('PEXPIREAT', KEYS[current], string.format('%.0f', boundsExpiry))
  -- Expire inactive shards without shortening pending deadlines.
  local function extendExpiry(key, deadline)
    if redis.call('PEXPIRETIME', key) < deadline then
      redis.call('PEXPIREAT', key, string.format('%.0f', deadline))
    end
  end
  -- Bound pending storage even when the dispatcher is paused during recording.
  expirePending(recordKey, dueKey, now, pendingTtl)
  if wroteRecord then
    extendExpiry(recordKey, due + pendingTtl)
    extendExpiry(dueKey, due + pendingTtl)
  end
`;

const RECORD_SCRIPT_HASH = createHash("sha1")
  .update(RECORD_SCRIPT)
  .digest("hex");

async function evalRecording(
  keys: string[],
  args: (string | number | Buffer)[],
) {
  if (!redis) throw new Error("Trace rule recording requires Redis");
  try {
    return await redis.evalsha(
      RECORD_SCRIPT_HASH,
      keys.length,
      ...keys,
      ...args,
    );
  } catch (error) {
    // A cache miss cannot have applied any updates; other failures propagate.
    if (!(error instanceof Error) || !error.message.startsWith("NOSCRIPT"))
      throw error;
    return redis.eval(RECORD_SCRIPT, keys.length, ...keys, ...args);
  }
}

/** Activity from an accepted direct event write. */
export type TraceSpanActivity = {
  traceId: string;
  spanStartTimeISO: string;
  /** Already filtered and sampled; [] still records activity. */
  ruleIds: readonly string[];
  /** UTF-8 length of the final event row after field overflow, excluding the size field. */
  serializedEventBytes: number;
};

/** Merge batch activity into Redis bounds, record, and due; no resampling. */
export async function recordTraceActivity(
  projectId: string,
  activity: readonly TraceSpanActivity[],
): Promise<void> {
  // Aggregate this batch locally; Lua merges it with other batches and workers.
  const updatesByTrace = new Map<
    string,
    {
      minStart: number;
      maxStart: number;
      serializedEventBytes: number;
      rules: Set<string>;
    }
  >();
  for (const span of activity) {
    const start = Date.parse(span.spanStartTimeISO);
    if (!Number.isFinite(start)) continue;
    const previous = updatesByTrace.get(span.traceId);
    if (previous) {
      previous.minStart = Math.min(previous.minStart, start);
      previous.maxStart = Math.max(previous.maxStart, start);
      previous.serializedEventBytes += span.serializedEventBytes;
      for (const ruleId of span.ruleIds) previous.rules.add(ruleId);
    } else {
      updatesByTrace.set(span.traceId, {
        minStart: start,
        maxStart: start,
        serializedEventBytes: span.serializedEventBytes,
        rules: new Set(span.ruleIds),
      });
    }
  }
  if (updatesByTrace.size === 0) return;
  if (!redis) throw new Error("Trace rule recording requires Redis");

  const idleMs = await resolveTraceIdleMs(projectId);
  if (!Number.isSafeInteger(idleMs) || idleMs <= 0)
    throw new Error("Trace batch idle time must be a positive integer");

  const shards = new Map<
    number,
    {
      member: string;
      minStart: number;
      maxStart: number;
      serializedEventBytes: number;
      rules: Set<string>;
    }[]
  >();
  for (const [traceId, update] of updatesByTrace) {
    const member = JSON.stringify([projectId, traceId]);
    const shard = getTraceBatchShard(member);
    const entries = shards.get(shard) ?? [];
    entries.push({ member, ...update });
    shards.set(shard, entries);
  }

  const clock = await redis.time();
  const now = Number(clock[0]) * 1_000 + Math.floor(Number(clock[1]) / 1_000);
  for (const [shard, entries] of shards) {
    const { record, due } = getRecordingKeys(shard);
    const bounds = getRecordingBoundsKeys(shard, now);
    const keys = [record, due, ...bounds.keys];
    for (let offset = 0; offset < entries.length; offset += REDIS_BATCH_SIZE) {
      const args = [
        idleMs,
        env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS,
        env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
        bounds.width,
        bounds.firstBucket,
        ...entries
          .slice(offset, offset + REDIS_BATCH_SIZE)
          .flatMap(
            ({ member, minStart, maxStart, rules, serializedEventBytes }) => [
              member,
              minStart,
              maxStart,
              randomUUID(),
              JSON.stringify([...rules]),
              serializedEventBytes,
              getTraceBatchFirstMember(member),
            ],
          ),
      ];
      await evalRecording(keys, args);
    }
  }
}
