import { createHash, randomUUID } from "node:crypto";
import {
  getShardIndex,
  getTracingReadinessSettings,
  logger,
  redis,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

const REDIS_BATCH_SIZE = 50;

const RECORD_SCRIPT = `
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local due = now + tonumber(ARGV[1])
  for i = 2, #ARGV, 5 do
    local member = ARGV[i]
    local minStart = tonumber(ARGV[i + 1])
    local maxStart = tonumber(ARGV[i + 2])
    local incomingRules = cjson.decode(ARGV[i + 4])
    local previousBounds = redis.call('HGET', KEYS[1], member)
    if previousBounds then
      local bounds = cjson.decode(previousBounds)
      minStart = math.min(minStart, bounds.minStart)
      maxStart = math.max(maxStart, bounds.maxStart)
    end
    redis.call('HSET', KEYS[1], member, cjson.encode({
      minStart = minStart, maxStart = maxStart
    }))

    local previousDispatch = redis.call('HGET', KEYS[2], member)
    local dispatch = previousDispatch and cjson.decode(previousDispatch)
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
    end
  end
`;

const RECORD_SCRIPT_HASH = createHash("sha1")
  .update(RECORD_SCRIPT)
  .digest("hex");

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
    // This namespace is independent of the existing trace-batch dispatcher.
    const tag = `{trace-dispatch:${shard}}`;
    const keys = [`${tag}:bounds`, `${tag}:dispatch`, `${tag}:due`];
    for (let offset = 0; offset < entries.length; offset += REDIS_BATCH_SIZE) {
      const args = [
        idleMs,
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
      try {
        await redis.evalsha(RECORD_SCRIPT_HASH, keys.length, ...keys, ...args);
      } catch (error) {
        // A cache miss cannot have applied any updates; other failures propagate.
        if (!(error instanceof Error) || !error.message.startsWith("NOSCRIPT"))
          throw error;
        await redis.eval(RECORD_SCRIPT, keys.length, ...keys, ...args);
      }
    }
  }
}
