import { createHash, randomUUID } from "node:crypto";
import { getShardIndex, redis } from "@langfuse/shared/src/server";
import { env } from "../../env";
import { resolveTraceIdleMs } from "./traceBatchReadiness";

const REDIS_BATCH_SIZE = 50;
const CLEANUP_SIZE = 100;

function getRecordingKeys(shard: number) {
  const tag = `{trace-dispatch:${shard}}`;
  return {
    bounds: `${tag}:bounds`,
    record: `${tag}:record`,
    due: `${tag}:due`,
  };
}

const RECORD_SCRIPT = `
  local boundsKey, recordKey, dueKey = KEYS[1], KEYS[2], KEYS[3]
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  -- Readiness uses recording time plus idle interval, not the spans' start times.
  local due = now + tonumber(ARGV[1])
  local boundsExpiry = now + tonumber(ARGV[2])
  local pendingTtl = tonumber(ARGV[3])
  local wroteRecord = false
  for i = 4, #ARGV, 5 do
    local member = ARGV[i]
    local minStart = tonumber(ARGV[i + 1])
    local maxStart = tonumber(ARGV[i + 2])
    local incomingRules = cjson.decode(ARGV[i + 4])

    -- 1. Merge the event-time bounds, even when no rule selected this activity.
    local previousBounds = redis.call('HGET', boundsKey, member)
    if previousBounds then
      local bounds = cjson.decode(previousBounds)
      if bounds.expiresAt and bounds.expiresAt > now then
        minStart = math.min(minStart, bounds.minStart)
        maxStart = math.max(maxStart, bounds.maxStart)
      end
    end
    redis.call('HSET', boundsKey, member, cjson.encode({
      minStart = minStart, maxStart = maxStart, expiresAt = boundsExpiry
    }))

    -- 2. Preserve live pending selections; expired selections cannot be revived.
    local previousRecord = redis.call('HGET', recordKey, member)
    local record = previousRecord and cjson.decode(previousRecord)
    local priorDue = tonumber(redis.call('ZSCORE', dueKey, member))
    if (record or priorDue) and (not priorDue or priorDue + pendingTtl <= now) then
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
      redis.call('PEXPIREAT', key, deadline)
    end
  end
  extendExpiry(boundsKey, boundsExpiry)
  if wroteRecord then
    extendExpiry(recordKey, due + pendingTtl)
    extendExpiry(dueKey, due + pendingTtl)
  end
`;

const CLEANUP_SCRIPT = `
  local boundsKey, recordKey, dueKey = KEYS[1], KEYS[2], KEYS[3]
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local expired = redis.call('ZRANGE', dueKey, '-inf', now - tonumber(ARGV[1]),
    'BYSCORE', 'LIMIT', 0, ${CLEANUP_SIZE})
  for _, member in ipairs(expired) do
    redis.call('HDEL', recordKey, member)
    redis.call('ZREM', dueKey, member)
  end
  for i = 2, #ARGV do
    local value = redis.call('HGET', boundsKey, ARGV[i])
    if value then
      local bounds = cjson.decode(value)
      -- The scan is only a candidate list; an arrival may have refreshed this field.
      if not bounds.expiresAt or bounds.expiresAt <= now then
        redis.call('HDEL', boundsKey, ARGV[i])
      end
    end
  end
  return #expired
`;

const scriptHashes = new Map(
  [RECORD_SCRIPT, CLEANUP_SCRIPT].map((script) => [
    script,
    createHash("sha1").update(script).digest("hex"),
  ]),
);

async function evalRecording(
  script: string,
  keys: ReturnType<typeof getRecordingKeys>,
  args: (string | number)[],
) {
  if (!redis) throw new Error("Trace rule recording requires Redis");
  const scriptKeys = [keys.bounds, keys.record, keys.due];
  try {
    return await redis.evalsha(
      scriptHashes.get(script)!,
      scriptKeys.length,
      ...scriptKeys,
      ...args,
    );
  } catch (error) {
    // A cache miss cannot have applied any updates; other failures propagate.
    if (!(error instanceof Error) || !error.message.startsWith("NOSCRIPT"))
      throw error;
    return redis.eval(script, scriptKeys.length, ...scriptKeys, ...args);
  }
}

/** Advance one bounds scan page and reclaim abandoned selections in bounded Lua calls. */
export async function cleanupTraceRuleRecording(shard: number, cursor: string) {
  if (!redis) throw new Error("Trace rule recording requires Redis");
  const keys = getRecordingKeys(shard);
  const [nextCursor, fields] = await redis.hscan(
    keys.bounds,
    cursor,
    "COUNT",
    CLEANUP_SIZE,
  );
  const members = fields.filter((_, index) => index % 2 === 0);
  let expired = 0;
  // HSCAN's COUNT is a hint; cap deletion batches even when a page is larger.
  for (
    let offset = 0;
    offset < Math.max(1, members.length);
    offset += CLEANUP_SIZE
  ) {
    expired = Number(
      await evalRecording(CLEANUP_SCRIPT, keys, [
        env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
        ...members.slice(offset, offset + CLEANUP_SIZE),
      ]),
    );
  }
  return { cursor: nextCursor, pendingRemaining: expired === CLEANUP_SIZE };
}

export type TraceSpanActivity = {
  traceId: string;
  spanStartTimeISO: string;
  /** Rule IDs already selected by filtering and sampling; empty still records activity. */
  ruleIds: readonly string[];
};

/** Merge bounds, selected rules, and readiness for one batch; this writer does not sample. */
export async function recordTraceActivity(
  projectId: string,
  activity: readonly TraceSpanActivity[],
): Promise<void> {
  // Aggregate this batch locally; Lua merges it with other batches and workers.
  const updatesByTrace = new Map<
    string,
    { minStart: number; maxStart: number; rules: Set<string> }
  >();
  for (const span of activity) {
    const start = Date.parse(span.spanStartTimeISO);
    if (!Number.isFinite(start)) continue;
    const previous = updatesByTrace.get(span.traceId);
    if (previous) {
      previous.minStart = Math.min(previous.minStart, start);
      previous.maxStart = Math.max(previous.maxStart, start);
      for (const ruleId of span.ruleIds) previous.rules.add(ruleId);
    } else {
      updatesByTrace.set(span.traceId, {
        minStart: start,
        maxStart: start,
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
    { member: string; minStart: number; maxStart: number; rules: Set<string> }[]
  >();
  for (const [traceId, update] of updatesByTrace) {
    const member = JSON.stringify([projectId, traceId]);
    const shard = getShardIndex(member, env.LANGFUSE_TRACE_BATCH_SHARD_COUNT);
    const entries = shards.get(shard) ?? [];
    entries.push({ member, ...update });
    shards.set(shard, entries);
  }

  for (const [shard, entries] of shards) {
    const keys = getRecordingKeys(shard);
    for (let offset = 0; offset < entries.length; offset += REDIS_BATCH_SIZE) {
      const args = [
        idleMs,
        env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS,
        env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
        ...entries
          .slice(offset, offset + REDIS_BATCH_SIZE)
          .flatMap(({ member, minStart, maxStart, rules }) => [
            member,
            minStart,
            maxStart,
            randomUUID(),
            JSON.stringify([...rules]),
          ]),
      ];
      await evalRecording(RECORD_SCRIPT, keys, args);
    }
  }
}
