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
    if #expired > 0 then
      redis.call('HDEL', pendingKey, unpack(expired))
      redis.call('ZREM', dueKey, unpack(expired))
    end
    return #expired
  end
`;

// Batched reads and writes: one MGET, HMGET, ZMSCORE, HSET, ZADD per chunk plus
// one SET per bounds key, so Redis CPU per trace stays near a single command.
const RECORD_SCRIPT = `
  ${EXPIRE_PENDING_SCRIPT}
  local pendingKey, dueKey = KEYS[1], KEYS[2]
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  -- Readiness uses recording time plus idle interval, not the spans' start times.
  local due = now + tonumber(ARGV[1])
  local boundsTtl = tonumber(ARGV[2])
  local pendingTtl = tonumber(ARGV[3])
  local count = #KEYS - 2
  local members, boundsKeys = {}, {}
  for i = 1, count do
    members[i] = ARGV[4 + (i - 1) * 6]
    boundsKeys[i] = KEYS[2 + i]
  end
  local previousBounds = redis.call('MGET', unpack(boundsKeys))
  local previousPending = redis.call('HMGET', pendingKey, unpack(members))
  local priorDues = redis.call('ZMSCORE', dueKey, unpack(members))
  local hset, zadd, removals = {}, {}, {}
  for i = 1, count do
    local base = 4 + (i - 1) * 6
    local member = members[i]
    local minStart = tonumber(ARGV[base + 1])
    local maxStart = tonumber(ARGV[base + 2])
    local incomingRules = cjson.decode(ARGV[base + 4])
    local serializedEventBytes = tonumber(ARGV[base + 5])

    -- 1. Merge bounds and refresh this trace's TTL, including nonmatches.
    local packed = previousBounds[i]
    if packed then
      local bounds = cmsgpack.unpack(packed)
      minStart = math.min(minStart, bounds[1])
      maxStart = math.max(maxStart, bounds[2])
      serializedEventBytes = serializedEventBytes + bounds[3]
    end
    redis.call('SET', boundsKeys[i], cmsgpack.pack({
      minStart, maxStart, serializedEventBytes
    }), 'PX', boundsTtl)

    -- 2. Merge pending selections; discard expired or incomplete state.
    local pending = previousPending[i] and cjson.decode(previousPending[i])
    local priorDue = tonumber(priorDues[i])
    local stale = (pending or priorDue) and (not packed or not priorDue or priorDue + pendingTtl <= now)
    if stale then pending = nil end
    if pending or #incomingRules > 0 then
      local rules = {}
      local seen = {}
      for _, id in ipairs(pending and pending.rules or {}) do
        if not seen[id] then table.insert(rules, id); seen[id] = true end
      end
      for _, id in ipairs(incomingRules) do
        if not seen[id] then table.insert(rules, id); seen[id] = true end
      end
      table.insert(hset, member)
      table.insert(hset, cjson.encode({
        revision = ARGV[base + 3], rules = rules,
        failed_cnt = pending and pending.failed_cnt or 0
      }))
      -- 3. Postpone pending traces on every arrival, including nonmatches.
      table.insert(zadd, due)
      table.insert(zadd, member)
    elseif stale then
      table.insert(removals, member)
    end
  end
  if #removals > 0 then
    redis.call('HDEL', pendingKey, unpack(removals))
    redis.call('ZREM', dueKey, unpack(removals))
  end
  if #hset > 0 then
    redis.call('HSET', pendingKey, unpack(hset))
    redis.call('ZADD', dueKey, unpack(zadd))
  end
  -- Expire inactive shards without shortening pending deadlines.
  local function extendExpiry(key, deadline)
    if redis.call('PEXPIRETIME', key) < deadline then
      redis.call('PEXPIREAT', key, string.format('%.0f', deadline))
    end
  end
  -- Bound pending storage even when the dispatcher is paused during recording.
  local expired = expirePending(pendingKey, dueKey, now, pendingTtl)
  if #hset > 0 then
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
  local cutoff, ttl = tonumber(ARGV[1]), tonumber(ARGV[2])
  local count = #KEYS - 2
  local members, boundsKeys = {}, {}
  for i = 1, count do
    members[i] = ARGV[2 + i]
    boundsKeys[i] = KEYS[2 + i]
  end
  local dues = redis.call('ZMSCORE', KEYS[1], unpack(members))
  local pendings = redis.call('HMGET', KEYS[2], unpack(members))
  local packedBounds = redis.call('MGET', unpack(boundsKeys))
  local result, orphans = {}, {}
  for i = 1, count do
    local due = tonumber(dues[i])
    if due and due <= cutoff and due > now - ttl then
      if pendings[i] and packedBounds[i] then
        local bounds = cmsgpack.unpack(packedBounds[i])
        local record = cjson.decode(pendings[i])
        table.insert(result, members[i])
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
        table.insert(orphans, members[i])
      end
    end
  end
  if #orphans > 0 then
    redis.call('HDEL', KEYS[2], unpack(orphans))
    redis.call('ZREM', KEYS[1], unpack(orphans))
  end
  return result
`;

// Enqueue acknowledgement preserves newer arrivals and leaves bounds untouched.
export const ACKNOWLEDGE_RECORDING_SCRIPT = `
  local members = {}
  for i = 1, #ARGV, 2 do table.insert(members, ARGV[i]) end
  local pendings = redis.call('HMGET', KEYS[2], unpack(members))
  local result, acknowledged = {}, {}
  for i = 1, #members do
    local pending = pendings[i]
    if pending and cjson.decode(pending).revision == ARGV[i * 2] then
      table.insert(acknowledged, members[i])
      table.insert(result, 1)
    else
      table.insert(result, 0)
    end
  end
  if #acknowledged > 0 then
    redis.call('HDEL', KEYS[2], unpack(acknowledged))
    redis.call('ZREM', KEYS[1], unpack(acknowledged))
  end
  return result
`;

const recordingScriptHashes = new Map(
  [RECORD_SCRIPT, HYDRATE_RECORDING_SCRIPT, ACKNOWLEDGE_RECORDING_SCRIPT].map(
    (script) => [script, createHash("sha1").update(script).digest("hex")],
  ),
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

  // Shards live in different slots, so their calls run concurrently; chunks
  // within a shard stay sequential. Every settled chunk is counted before the
  // first failure propagates.
  const outcomes = await Promise.allSettled(
    [...shards].map(async ([shard, entries]) => {
      const { pending, due } = getRecordingKeys(shard);
      for (
        let offset = 0;
        offset < entries.length;
        offset += REDIS_BATCH_SIZE
      ) {
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
        recordTrackingVolume("recorded", chunk);
        recordIncrement("langfuse.trace_dispatch.tracked_traces", chunk.length);
        recordIncrement("langfuse.trace_dispatch.expired_traces", expired, {
          source: "ingestion",
        });
      }
    }),
  );
  const failure = outcomes.find(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === "rejected",
  );
  if (failure) throw failure.reason;
}
