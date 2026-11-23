import { createHash } from "node:crypto";
import { getShardIndex, logger, redis } from "@langfuse/shared/src/server";
import { applyTopicRuleProcessingCostBatch } from "@langfuse/shared/topics/server";
import { PeriodicRunner } from "../../utils/PeriodicRunner";

const FLUSH_INTERVAL_MS = 5 * 60_000;
const RECEIPT_WINDOW_MS = 5 * 60_000;
// Fixed hash tags keep each project's dirty index and all its keys on one Redis Cluster slot.
const SHARD_COUNT = 16;
const shardKey = (shard: number) => `{topics-processing-cost:${shard}}`;
const projectKeys = (projectId: string) => {
  const shard = shardKey(getShardIndex(projectId, SHARD_COUNT));
  return {
    prefix: `${shard}:project:${projectId}`,
    dirty: `${shard}:dirty`,
    sequence: `${shard}:sequence`,
  };
};

type RuleShare = Parameters<
  typeof applyTopicRuleProcessingCostBatch
>[0]["shares"][number];

function redisClient() {
  if (!redis)
    throw new Error("Topics processing cost buffering requires Redis");
  return redis;
}

function script(source: string) {
  const sha = createHash("sha1").update(source).digest("hex");
  return async (keys: string[], args: (string | number)[]) => {
    const client = redisClient();
    try {
      return await client.evalsha(sha, keys.length, ...keys, ...args);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("NOSCRIPT"))
        throw error;
      return client.eval(source, keys.length, ...keys, ...args);
    }
  };
}

const redisTime = `
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
`;

const append = script(`
  ${redisTime}
  local expires = tonumber(ARGV[3])
  if now >= expires then return -1 end
  if redis.call('SADD', KEYS[3], ARGV[2]) == 0 then return 0 end
  redis.call('PEXPIREAT', KEYS[3], expires)
  for i = 4, #ARGV, 3 do
    local rule, cost, partial = ARGV[i], ARGV[i+1], ARGV[i+2]
    if cost ~= '' then redis.call('HINCRBYFLOAT', KEYS[1], 'cost:' .. rule, cost) end
    if partial == '1' or cost == '' then redis.call('HSET', KEYS[1], 'partial:' .. rule, 1) end
  end
  redis.call('SADD', KEYS[2], ARGV[1])
  return 1
`);

/** A real provider retry gets a fresh receipt. A retry of this append reuses its receipt. */
export async function bufferTopicRuleProcessingCosts(report: {
  projectId: string;
  receiptId: string;
  recordedAt: Date;
  shares: RuleShare[];
}) {
  const { projectId, receiptId, recordedAt, shares } = report;
  if (!shares.length) return;
  const { prefix, dirty } = projectKeys(projectId);
  // Expire the whole receipt bucket together, even if a worker replays a timed-out command late.
  const minute = Math.floor(recordedAt.getTime() / 60_000);
  const expiresAt = (minute + 1) * 60_000 + RECEIPT_WINDOW_MS;
  const result = await append(
    [`${prefix}:pending`, dirty, `${prefix}:receipts:${minute}`],
    [
      projectId,
      receiptId,
      expiresAt,
      ...shares.flatMap(({ ruleId, cost, partial }) => [
        ruleId,
        cost ?? "",
        Number(partial),
      ]),
    ],
  );
  if (result === -1) throw new Error("Topics processing cost receipt expired");
}

const freeze = script(`
  local pending, inflight, watermark = KEYS[1], KEYS[2], KEYS[3]
  if redis.call('EXISTS', inflight) == 0 then
    if redis.call('EXISTS', pending) == 0 then return {} end
    ${redisTime}
    local sequence = math.max(now, tonumber(redis.call('GET', watermark) or 0) + 1)
    redis.call('SET', watermark, sequence)
    redis.call('RENAME', pending, inflight)
    redis.call('HSET', inflight, 'sequence', sequence)
  end
  return redis.call('HGETALL', inflight)
`);

const acknowledge = script(`
  if redis.call('HGET', KEYS[2], 'sequence') ~= ARGV[2] then return end
  redis.call('DEL', KEYS[2])
  if redis.call('EXISTS', KEYS[1]) == 0 then redis.call('SREM', KEYS[3], ARGV[1]) end
`);

/** Publish the oldest batch. A lost commit response leaves the same batch available for replay. */
export async function flushTopicProjectProcessingCosts(
  projectId: string,
  apply = applyTopicRuleProcessingCostBatch,
) {
  const { prefix, dirty, sequence: watermark } = projectKeys(projectId);
  const pending = `${prefix}:pending`;
  const inflight = `${prefix}:inflight`;
  const fields = (await freeze([pending, inflight, watermark], [])) as string[];
  if (!fields.length) return;
  const byRule = new Map<string, RuleShare>();
  let sequence = 0;
  for (let i = 0; i < fields.length; i += 2) {
    const field = fields[i];
    const value = fields[i + 1];
    if (field === "sequence") {
      sequence = Number(value);
      continue;
    }
    const delimiter = field.indexOf(":");
    const ruleId = field.slice(delimiter + 1);
    const share = byRule.get(ruleId) ?? { ruleId, cost: null, partial: false };
    if (field.startsWith("cost:")) share.cost = Number(value);
    else share.partial = true;
    byRule.set(ruleId, share);
  }
  await apply({ projectId, sequence, shares: [...byRule.values()] });
  await acknowledge([pending, inflight, dirty], [projectId, sequence]);
}

/** Scan only dirty project IDs. A failed or interrupted flush leaves its project discoverable. */
export async function* dirtyTopicProcessingCostProjects() {
  const client = redisClient();
  for (let shard = 0; shard < SHARD_COUNT; shard++) {
    let cursor = "0";
    do {
      const page = await client.sscan(
        `${shardKey(shard)}:dirty`,
        cursor,
        "COUNT",
        100,
      );
      cursor = page[0];
      yield* page[1];
    } while (cursor !== "0");
  }
}

export class TopicProcessingCostFlushRunner extends PeriodicRunner {
  protected readonly name = "TopicProcessingCostFlushRunner";
  protected readonly defaultIntervalMs = FLUSH_INTERVAL_MS;

  constructor() {
    super("topics_processing_cost_flush");
  }

  protected async execute() {
    // Keep the slot after completion so staggered trace workers share one flush interval.
    const acquired = await redisClient().set(
      "langfuse:topics-processing-cost-flush",
      "1",
      "PX",
      FLUSH_INTERVAL_MS,
      "NX",
    );
    if (!acquired) {
      this.markRunSkipped();
      return;
    }
    for await (const projectId of dirtyTopicProcessingCostProjects()) {
      try {
        await flushTopicProjectProcessingCosts(projectId);
      } catch (error) {
        this.markRunFailed(error);
        logger.warn("Failed to flush Topics processing costs", {
          projectId,
          error,
        });
      }
    }
  }
}
