import { createHash, randomUUID } from "node:crypto";
import calculateSlot from "cluster-key-slot";
import { recordIncrement, redis } from "@langfuse/shared/src/server";
import { env } from "../../env";
import {
  getTraceBatchFirstMember,
  getTraceBatchShard,
  resolveTraceIdleMs,
} from "./traceBatchReadiness";

const REDIS_BATCH_SIZE = 50;
const CLEANUP_SIZE = 100;
const SLOT_COUNT = 16_384;
const shardTags = new Map<string, string>();

/** Tag whose slot sits mid-range in this shard's share of the slot space, so shards spread evenly over masters. */
export function getRecordingTag(shard: number): string {
  const count = env.LANGFUSE_TRACE_BATCH_SHARD_COUNT;
  const cached = shardTags.get(`${count}:${shard}`);
  if (cached !== undefined) return cached;
  const width = SLOT_COUNT / count;
  const low = Math.floor((shard + 0.375) * width);
  const high = Math.ceil((shard + 0.625) * width);
  for (let suffix = 0; ; suffix++) {
    const tag = `{trace-dispatch:${shard}:${suffix.toString(36)}}`;
    const slot = calculateSlot(tag);
    if (slot >= low && slot < high) {
      shardTags.set(`${count}:${shard}`, tag);
      return tag;
    }
  }
}

export function getRecordingKeys(shard: number) {
  const tag = getRecordingTag(shard);
  return {
    pending: `${tag}:pending`,
    due: `${tag}:due`,
  };
}

/** One string key per trace with a native TTL; the raw 16-byte trace hash keeps the key short. */
export function getRecordingBoundsKey(shard: number, member: string): Buffer {
  return Buffer.concat([
    Buffer.from(`${getRecordingTag(shard)}:b:`),
    getTraceBatchFirstMember(member),
  ]);
}

const EXPIRE_PENDING_SCRIPT = `
  local function expirePending(pendingKey, dueKey, now, retention)
    local expired = redis.call('ZRANGE', dueKey, '-inf', now - retention,
      'BYSCORE', 'LIMIT', 0, ${CLEANUP_SIZE})
    for _, member in ipairs(expired) do
      redis.call('HDEL', pendingKey, member)
      redis.call('ZREM', dueKey, member)
    end
    return #expired
  end
`;

const RECORD_SCRIPT = `
  ${EXPIRE_PENDING_SCRIPT}
  local pendingKey, dueKey = KEYS[1], KEYS[2]
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  -- Readiness uses recording time plus idle interval, not the spans' start times.
  local due = now + tonumber(ARGV[1])
  local boundsTtl = tonumber(ARGV[2])
  local pendingTtl = tonumber(ARGV[3])
  local wrotePending = false
  for key = 3, #KEYS do
    -- Each bounds key has six matching arguments.
    local i = 4 + (key - 3) * 6
    local member = ARGV[i]
    local minStart = tonumber(ARGV[i + 1])
    local maxStart = tonumber(ARGV[i + 2])
    local incomingRules = cjson.decode(ARGV[i + 4])
    local serializedEventBytes = tonumber(ARGV[i + 5])

    -- 1. Merge bounds and refresh this trace's TTL, including nonmatches.
    local previousBounds = redis.call('GET', KEYS[key])
    if previousBounds then
      local bounds = cmsgpack.unpack(previousBounds)
      minStart = math.min(minStart, bounds[1])
      maxStart = math.max(maxStart, bounds[2])
      serializedEventBytes = serializedEventBytes + bounds[3]
    end
    redis.call('SET', KEYS[key], cmsgpack.pack({
      minStart, maxStart, serializedEventBytes
    }), 'PX', boundsTtl)

    -- 2. Merge pending selections; discard expired or incomplete state.
    local previousPending = redis.call('HGET', pendingKey, member)
    local pending = previousPending and cjson.decode(previousPending)
    local priorDue = tonumber(redis.call('ZSCORE', dueKey, member))
    if (pending or priorDue) and (not previousBounds or not priorDue or priorDue + pendingTtl <= now) then
      pending = nil
      redis.call('HDEL', pendingKey, member)
      redis.call('ZREM', dueKey, member)
    end
    if pending or #incomingRules > 0 then
      local rules = {}
      local seen = {}
      for _, id in ipairs(pending and pending.rules or {}) do
        if not seen[id] then table.insert(rules, id); seen[id] = true end
      end
      for _, id in ipairs(incomingRules) do
        if not seen[id] then table.insert(rules, id); seen[id] = true end
      end
      redis.call('HSET', pendingKey, member, cjson.encode({
        revision = ARGV[i + 3], rules = rules,
        failed_cnt = pending and pending.failed_cnt or 0
      }))
      -- 3. Postpone pending traces on every arrival, including nonmatches.
      redis.call('ZADD', dueKey, due, member)
      wrotePending = true
    end
  end
  -- Expire inactive shards without shortening pending deadlines.
  local function extendExpiry(key, deadline)
    if redis.call('PEXPIRETIME', key) < deadline then
      redis.call('PEXPIREAT', key, string.format('%.0f', deadline))
    end
  end
  -- Bound pending storage even when the dispatcher is paused during recording.
  local expired = expirePending(pendingKey, dueKey, now, pendingTtl)
  if wrotePending then
    extendExpiry(pendingKey, due + pendingTtl)
    extendExpiry(dueKey, due + pendingTtl)
  end
  return expired
`;

// Read readiness, revision and retained bounds atomically before enqueueing.
// KEYS: due, pending, then one bounds key per member; ARGV: cutoff, pending TTL, then the members.
export const HYDRATE_RECORDING_SCRIPT = `
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local result = {}
  for key = 3, #KEYS do
    local member = ARGV[key]
    local due = tonumber(redis.call('ZSCORE', KEYS[1], member))
    if due and due <= tonumber(ARGV[1]) and due > now - tonumber(ARGV[2]) then
      local pending = redis.call('HGET', KEYS[2], member)
      local packedBounds = pending and redis.call('GET', KEYS[key])
      if pending and packedBounds then
        local bounds = cmsgpack.unpack(packedBounds)
        local record = cjson.decode(pending)
        table.insert(result, member)
        table.insert(result, cjson.encode({
          revision = record.revision,
          minStart = bounds[1], maxStart = bounds[2],
          serializedEventBytes = bounds[3],
          -- cjson encodes an empty table as an object, so omit empty rules.
          ruleIds = (record.rules and #record.rules > 0) and record.rules or nil,
          failedCount = record.failed_cnt or 0
        }))
        table.insert(result, tostring(due))
      else
        -- Orphans must not keep occupying the oldest-due candidate window.
        redis.call('HDEL', KEYS[2], member)
        redis.call('ZREM', KEYS[1], member)
      end
    end
  end
  return result
`;

// Enqueue acknowledgement preserves newer arrivals and leaves bounds untouched.
export const ACKNOWLEDGE_RECORDING_SCRIPT = `
  local result = {}
  for i = 1, #ARGV, 2 do
    local pending = redis.call('HGET', KEYS[2], ARGV[i])
    if pending and cjson.decode(pending).revision == ARGV[i + 1] then
      redis.call('HDEL', KEYS[2], ARGV[i])
      redis.call('ZREM', KEYS[1], ARGV[i])
      table.insert(result, 1)
    else
      table.insert(result, 0)
    end
  end
  return result
`;

// Return traces whose processing failed after enqueueing.
// KEYS: pending, due, then one bounds key per member.
// ARGV: pending TTL, then per member: member, failed revision, fresh revision, rules JSON, failed count, backoff.
// Returns per member: 0 bounds expired, 1 restored, 2 merged into newer pending state.
export const RESTORE_RECORDING_SCRIPT = `
  local pendingKey, dueKey = KEYS[1], KEYS[2]
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local pendingTtl = tonumber(ARGV[1])
  local latestDue = 0
  local result = {}
  for key = 3, #KEYS do
    local i = 2 + (key - 3) * 6
    local member = ARGV[i]
    if redis.call('EXISTS', KEYS[key]) == 0 then
      table.insert(result, 0)
    else
      local previous = redis.call('HGET', pendingKey, member)
      local pending = previous and cjson.decode(previous)
      local rules = {}
      local seen = {}
      for _, id in ipairs(pending and pending.rules or {}) do
        if not seen[id] then table.insert(rules, id); seen[id] = true end
      end
      for _, id in ipairs(cjson.decode(ARGV[i + 3])) do
        if not seen[id] then table.insert(rules, id); seen[id] = true end
      end
      -- The failed revision is still pending when the dispatcher has not acknowledged it yet;
      -- replacing it keeps that acknowledgement from deleting the retry.
      if pending and pending.revision ~= ARGV[i + 1] then
        -- Newer activity owns revision, due and failures; keep the failed rules.
        pending.rules = rules
        redis.call('HSET', pendingKey, member, cjson.encode(pending))
        table.insert(result, 2)
      else
        local due = now + tonumber(ARGV[i + 5])
        redis.call('HSET', pendingKey, member, cjson.encode({
          revision = ARGV[i + 2], rules = rules,
          failed_cnt = tonumber(ARGV[i + 4])
        }))
        redis.call('ZADD', dueKey, due, member)
        latestDue = math.max(latestDue, due)
        table.insert(result, 1)
      end
    end
  end
  if latestDue > 0 then
    for _, key in ipairs({ pendingKey, dueKey }) do
      if redis.call('PEXPIRETIME', key) < latestDue + pendingTtl then
        redis.call('PEXPIREAT', key, string.format('%.0f', latestDue + pendingTtl))
      end
    end
  end
  return result
`;

const recordingScriptHashes = new Map(
  [
    RECORD_SCRIPT,
    HYDRATE_RECORDING_SCRIPT,
    ACKNOWLEDGE_RECORDING_SCRIPT,
    RESTORE_RECORDING_SCRIPT,
  ].map((script) => [script, createHash("sha1").update(script).digest("hex")]),
);

export async function evalRecording(
  script: string,
  keys: (string | Buffer)[],
  args: (string | number)[],
) {
  if (!redis) throw new Error("Trace rule recording requires Redis");
  try {
    return await redis.evalsha(
      recordingScriptHashes.get(script)!,
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

/** Activity from an accepted direct event write. */
export type TraceSpanActivity = {
  traceId: string;
  spanStartTimeISO: string;
  /** Already filtered and sampled; [] still records activity. */
  ruleIds: readonly string[];
  /** UTF-8 length of the final event row after field overflow, excluding the size field. */
  serializedEventBytes: number;
};

function recordTrackingVolume(
  stage: "admitted" | "recorded",
  updates: Iterable<{ eventUpdateCount: number; serializedEventBytes: number }>,
): void {
  let events = 0;
  let bytes = 0;
  for (const update of updates) {
    events += update.eventUpdateCount;
    bytes += update.serializedEventBytes;
  }
  recordIncrement("langfuse.trace_dispatch.event_updates", events, { stage });
  recordIncrement("langfuse.trace_dispatch.serialized_event_bytes", bytes, {
    stage,
  });
}

/** Merge batch activity into Redis bounds, pending, and due; no resampling. */
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
      previous.eventUpdateCount++;
      previous.serializedEventBytes += span.serializedEventBytes;
      for (const ruleId of span.ruleIds) previous.rules.add(ruleId);
    } else {
      updatesByTrace.set(span.traceId, {
        minStart: start,
        maxStart: start,
        eventUpdateCount: 1,
        serializedEventBytes: span.serializedEventBytes,
        rules: new Set(span.ruleIds),
      });
    }
  }
  if (updatesByTrace.size === 0) return;
  recordTrackingVolume("admitted", updatesByTrace.values());
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

  for (const [shard, entries] of shards) {
    const { pending, due } = getRecordingKeys(shard);
    for (let offset = 0; offset < entries.length; offset += REDIS_BATCH_SIZE) {
      const chunk = entries.slice(offset, offset + REDIS_BATCH_SIZE);
      const keys = [
        pending,
        due,
        ...chunk.map(({ member }) => getRecordingBoundsKey(shard, member)),
      ];
      const args = [
        idleMs,
        env.LANGFUSE_TRACE_DISPATCH_BOUNDS_TTL_MS,
        env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
        ...chunk.flatMap(
          ({ member, minStart, maxStart, rules, serializedEventBytes }) => [
            member,
            minStart,
            maxStart,
            randomUUID(),
            JSON.stringify([...rules]),
            serializedEventBytes,
          ],
        ),
      ];
      const expired = Number(await evalRecording(RECORD_SCRIPT, keys, args));
      // Count each acknowledged chunk, even if a later chunk fails.
      recordTrackingVolume("recorded", chunk);
      recordIncrement("langfuse.trace_dispatch.tracked_traces", chunk.length);
      recordIncrement("langfuse.trace_dispatch.expired_traces", expired, {
        source: "ingestion",
      });
    }
  }
}
