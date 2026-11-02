import { createHash, randomUUID } from "node:crypto";
import {
  getShardIndex,
  getTracingReadinessSettings,
  logger,
  redis,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

const REDIS_BATCH_SIZE = 50;
const CLEANUP_SIZE = 100;

function getRecordingKeys(shard: number) {
  const tag = `{trace-dispatch:${shard}}`;
  return [`${tag}:bounds`, `${tag}:dispatch`, `${tag}:due`];
}

const RECORD_SCRIPT = `
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local due = now + tonumber(ARGV[1])
  local boundsExpiry = now + tonumber(ARGV[2])
  local pendingTtl = tonumber(ARGV[3])
  local wroteDispatch = false
  for i = 4, #ARGV, 5 do
    local member = ARGV[i]
    local minStart = tonumber(ARGV[i + 1])
    local maxStart = tonumber(ARGV[i + 2])
    local incomingRules = cjson.decode(ARGV[i + 4])
    local previousBounds = redis.call('HGET', KEYS[1], member)
    if previousBounds then
      local bounds = cjson.decode(previousBounds)
      if bounds.expiresAt and bounds.expiresAt > now then
        minStart = math.min(minStart, bounds.minStart)
        maxStart = math.max(maxStart, bounds.maxStart)
      end
    end
    redis.call('HSET', KEYS[1], member, cjson.encode({
      minStart = minStart, maxStart = maxStart, expiresAt = boundsExpiry
    }))

    local previousDispatch = redis.call('HGET', KEYS[2], member)
    local dispatch = previousDispatch and cjson.decode(previousDispatch)
    local priorDue = tonumber(redis.call('ZSCORE', KEYS[3], member))
    if (dispatch or priorDue) and (not priorDue or priorDue + pendingTtl <= now) then
      dispatch = nil
      redis.call('HDEL', KEYS[2], member)
      redis.call('ZREM', KEYS[3], member)
    end
    if dispatch or #incomingRules > 0 then
      local rules = {}
      local seen = {}
      for _, id in ipairs(dispatch and dispatch.rules or {}) do
        if not seen[id] then table.insert(rules, id); seen[id] = true end
      end
      for _, id in ipairs(incomingRules) do
        if not seen[id] then table.insert(rules, id); seen[id] = true end
      end
      redis.call('HSET', KEYS[2], member, cjson.encode({
        revision = ARGV[i + 3], rules = rules,
        failed_cnt = dispatch and dispatch.failed_cnt or 0
      }))
      redis.call('ZADD', KEYS[3], due, member)
      wroteDispatch = true
    end
  end
  -- Whole-key expiry reclaims inactive shards without shortening another trace's deadline.
  local function extendExpiry(key, deadline)
    if redis.call('PEXPIRETIME', key) < deadline then
      redis.call('PEXPIREAT', key, deadline)
    end
  end
  extendExpiry(KEYS[1], boundsExpiry)
  if wroteDispatch then
    extendExpiry(KEYS[2], due + pendingTtl)
    extendExpiry(KEYS[3], due + pendingTtl)
  end
`;

const CLEANUP_SCRIPT = `
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local expired = redis.call('ZRANGE', KEYS[3], '-inf', now - tonumber(ARGV[1]),
    'BYSCORE', 'LIMIT', 0, ${CLEANUP_SIZE})
  for _, member in ipairs(expired) do
    redis.call('HDEL', KEYS[2], member)
    redis.call('ZREM', KEYS[3], member)
  end
  for i = 2, #ARGV do
    local value = redis.call('HGET', KEYS[1], ARGV[i])
    if value then
      local bounds = cjson.decode(value)
      -- The scan is only a candidate list; an arrival may have refreshed this field.
      if not bounds.expiresAt or bounds.expiresAt <= now then
        redis.call('HDEL', KEYS[1], ARGV[i])
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

/** Advance one bounds scan page and reclaim abandoned selections in bounded Lua calls. */
export async function cleanupTraceRuleRecording(shard: number, cursor: string) {
  if (!redis) throw new Error("Trace rule recording requires Redis");
  const keys = getRecordingKeys(shard);
  const [nextCursor, fields] = await redis.hscan(
    keys[0],
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

/** Retain observed bounds and record sampled rule matches for later dispatch. */
export async function recordTraceRuleMatches(
  projectId: string,
  events: readonly {
    traceId: string;
    startTimeISO: string;
    ruleIds: readonly string[];
  }[],
): Promise<void> {
  const traces = new Map<
    string,
    { minStart: number; maxStart: number; rules: Set<string> }
  >();
  for (const event of events) {
    const start = Date.parse(event.startTimeISO);
    if (!Number.isFinite(start)) continue;
    const previous = traces.get(event.traceId);
    if (previous) {
      previous.minStart = Math.min(previous.minStart, start);
      previous.maxStart = Math.max(previous.maxStart, start);
      for (const ruleId of event.ruleIds) previous.rules.add(ruleId);
    } else {
      traces.set(event.traceId, {
        minStart: start,
        maxStart: start,
        rules: new Set(event.ruleIds),
      });
    }
  }
  if (traces.size === 0) return;
  if (!redis) throw new Error("Trace rule recording requires Redis");

  let idleMs = env.LANGFUSE_TRACE_BATCH_IDLE_MS;
  try {
    const settings = await getTracingReadinessSettings(projectId);
    idleMs = settings.traceIdleMs ?? idleMs;
  } catch (error) {
    logger.warn("Failed to read trace idle time, using the default", {
      projectId,
      error,
    });
  }

  const shards = new Map<
    number,
    { member: string; minStart: number; maxStart: number; rules: Set<string> }[]
  >();
  for (const [traceId, bounds] of traces) {
    const member = JSON.stringify([projectId, traceId]);
    const shard = getShardIndex(member, env.LANGFUSE_TRACE_BATCH_SHARD_COUNT);
    const entries = shards.get(shard) ?? [];
    entries.push({ member, ...bounds });
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
