import { createHash, randomUUID } from "node:crypto";
import { redis } from "@langfuse/shared/src/server";
import { env } from "../../env";
import { getTraceBatchShard, resolveTraceIdleMs } from "./traceBatchReadiness";

const REDIS_BATCH_SIZE = 50;
const CLEANUP_SIZE = 100;

function getRecordingKeys(shard: number) {
  const tag = `{trace-dispatch:${shard}}`;
  return {
    record: `${tag}:record`,
    due: `${tag}:due`,
  };
}

// Include the next hour in case Redis crosses a bucket boundary before EVAL.
export function getRecordingBoundsKeys(shard: number, now: number) {
  const ttl = env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS;
  const width = Math.min(3_600_000, ttl);
  const firstBucket = Math.floor((now - ttl) / width);
  const lastBucket = Math.floor(now / width) + 1;
  return {
    width,
    firstBucket,
    keys: Array.from(
      { length: lastBucket - firstBucket + 1 },
      (_, index) => `{trace-dispatch:${shard}}:bounds:${firstBucket + index}`,
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
  for i = 6, #ARGV, 6 do
    local member = ARGV[i]
    local minStart = tonumber(ARGV[i + 1])
    local maxStart = tonumber(ARGV[i + 2])
    local incomingRules = cjson.decode(ARGV[i + 4])
    local eventUpdateCount = tonumber(ARGV[i + 5])

    -- 1. Merge the event-time bounds, even when no rule selected this activity.
    -- Keep each trace in its first-arrival bucket for a fixed retention window.
    local boundsIndex, previousBounds = current, nil
    for key = 3, #KEYS do
      previousBounds = redis.call('HGET', KEYS[key], member)
      if previousBounds then boundsIndex = key; break end
    end
    if previousBounds then
      local bounds = cjson.decode(previousBounds)
      minStart = math.min(minStart, bounds.minStart)
      maxStart = math.max(maxStart, bounds.maxStart)
      eventUpdateCount = eventUpdateCount + bounds.eventUpdateCount
    end
    redis.call('HSET', KEYS[boundsIndex], member, cjson.encode({
      minStart = minStart, maxStart = maxStart, eventUpdateCount = eventUpdateCount
    }))
    local boundsExpiry = (firstBucket + boundsIndex - 2) * width + boundsTtl
    redis.call('PEXPIREAT', KEYS[boundsIndex], string.format('%.0f', boundsExpiry))

    -- 2. Preserve live pending selections; expired selections cannot be revived.
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
      -- 3. Any activity postpones a pending trace, including nonmatching spans.
      redis.call('ZADD', dueKey, due, member)
      wroteRecord = true
    end
  end
  -- Whole-key expiry reclaims inactive shards without shortening another trace's deadline.
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

const CLEANUP_SCRIPT = `
  ${EXPIRE_PENDING_SCRIPT}
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  return expirePending(KEYS[1], KEYS[2], now, tonumber(ARGV[1]))
`;

const scriptHashes = new Map(
  [RECORD_SCRIPT, CLEANUP_SCRIPT].map((script) => [
    script,
    createHash("sha1").update(script).digest("hex"),
  ]),
);

async function evalRecording(
  script: string,
  keys: string[],
  args: (string | number)[],
) {
  if (!redis) throw new Error("Trace rule recording requires Redis");
  try {
    return await redis.evalsha(
      scriptHashes.get(script)!,
      keys.length,
      ...keys,
      ...args,
    );
  } catch (error) {
    // A cache miss cannot have applied any updates; other failures propagate.
    if (!(error instanceof Error) || !error.message.startsWith("NOSCRIPT"))
      throw error;
    return redis.eval(script, keys.length, ...keys, ...args);
  }
}

/** Reclaim one batch of abandoned selections; bounds expire through bucket TTLs. */
export async function cleanupTraceRuleRecording(shard: number) {
  const { record, due } = getRecordingKeys(shard);
  const expired = Number(
    await evalRecording(
      CLEANUP_SCRIPT,
      [record, due],
      [env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS],
    ),
  );
  return expired === CLEANUP_SIZE;
}

/** One directly written span; each span counts as one event update of its trace. */
export type TraceSpanActivity = {
  traceId: string;
  spanStartTimeISO: string;
  /** Rule IDs already selected by filtering and sampling; empty still records activity. */
  ruleIds: readonly string[];
};

/** Merge bounds, event counts, selected rules, and readiness for one batch; this writer does not sample. */
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
      eventUpdateCount: number;
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
      previous.eventUpdateCount += 1;
      for (const ruleId of span.ruleIds) previous.rules.add(ruleId);
    } else {
      updatesByTrace.set(span.traceId, {
        minStart: start,
        maxStart: start,
        eventUpdateCount: 1,
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
      eventUpdateCount: number;
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
            ({ member, minStart, maxStart, rules, eventUpdateCount }) => [
              member,
              minStart,
              maxStart,
              randomUUID(),
              JSON.stringify([...rules]),
              eventUpdateCount,
            ],
          ),
      ];
      await evalRecording(RECORD_SCRIPT, keys, args);
    }
  }
}
