import { createHash, randomUUID } from "node:crypto";
import { TooManyRequestsError } from "../../errors/TooManyRequestsError";
import type { FilterState } from "../../types";
import {
  type TopicCostEstimate,
  type TopicCostEstimatePrices,
  type TopicFacetRef,
} from "../../topics";
import { findModel } from "../ingestion/modelMatch";
import { calculateModelUsageCosts } from "../pricing-tiers/calculateModelUsageCosts";
import { redis } from "../redis/redis";
import { TOPICS_TEXT_VERSION } from "../transcript/topics-model-input";
import { enqueueTopicCostEstimate } from "./queue";

// Outlives the job's two-minute deadline, so a lost job frees the project soon after.
const RUNNING_TTL_MS = 3 * 60_000;
// Until the job starts, the record outlives a wait behind other setup jobs.
const QUEUED_TTL_MS = 15 * 60_000;
const DONE_TTL_MS = 24 * 60 * 60_000;
const FAILED_TTL_MS = 60_000;
const HOURLY_LIMIT = 10;

// The project hash tag keeps an estimate's keys in one cluster slot.
const recordKey = (projectId: string, key: string) =>
  `topics:cost-estimate:{${projectId}}:${key}`;
const lockKey = (projectId: string) =>
  `topics:cost-estimate:{${projectId}}:running`;
const hourlyKey = (projectId: string) =>
  `topics:cost-estimate:{${projectId}}:hourly`;

/** Same inputs, same key: a finished estimate is reused while its record lasts. */
export function topicCostEstimateKey(inputs: TopicCostEstimate["inputs"]) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        inputs.filter,
        inputs.facets,
        inputs.summaryModel,
        inputs.embeddingModel,
        TOPICS_TEXT_VERSION,
      ]),
    )
    .digest("hex")
    .slice(0, 32);
}

// 1: claimed; 0: an estimate for these inputs is running or has measured traces; 2: another estimate of the project runs; 3: hourly limit.
const CLAIM_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current then
  local record = cjson.decode(current)
  if record.status == 'running' then return {0, current} end
  if record.status == 'done' and record.sampled > 0 then return {0, current} end
end
if redis.call('EXISTS', KEYS[2]) == 1 then return {2, ''} end
local count = redis.call('INCR', KEYS[3])
if count == 1 then redis.call('PEXPIRE', KEYS[3], 3600000) end
if count > tonumber(ARGV[4]) then return {3, ''} end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
redis.call('SET', KEYS[2], ARGV[3], 'PX', ARGV[2])
return {1, ARGV[1]}`;

// Writes only while the record is this run's and still running; a final write frees the project.
const WRITE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local record = cjson.decode(current)
if record.status ~= 'running' or record.runId ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
if redis.call('GET', KEYS[2]) == ARGV[1] then
  if ARGV[4] == '1' then
    redis.call('DEL', KEYS[2])
  else
    redis.call('PEXPIRE', KEYS[2], ARGV[3])
  end
end
return 1`;

export async function readTopicCostEstimate(
  projectId: string,
  key: string,
): Promise<TopicCostEstimate | null> {
  const value = await redis?.get(recordKey(projectId, key));
  return value ? (JSON.parse(value) as TopicCostEstimate) : null;
}

type TopicCostEstimateStart = {
  projectId: string;
  filter: FilterState;
  facets: TopicFacetRef[];
  summaryModel: string;
  embeddingModel: string | null;
};

/**
 * Claims a running record unless one for the same inputs is running or has
 * measured traces; then returns that one. One estimate runs per project.
 */
export async function claimTopicCostEstimate(
  input: TopicCostEstimateStart,
): Promise<{ claimed: boolean; estimate: TopicCostEstimate }> {
  if (!redis) throw new Error("Topics cost estimates require Redis.");
  const inputs: TopicCostEstimate["inputs"] = {
    filter: input.filter,
    facets: input.facets,
    summaryModel: input.summaryModel,
    embeddingModel: input.embeddingModel,
  };
  const key = topicCostEstimateKey(inputs);
  const record: TopicCostEstimate = {
    key,
    runId: randomUUID(),
    status: "running",
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
    inputs,
    sampled: 0,
    summarizable: 0,
    skipped: { tooLarge: 0, noContent: 0 },
    tokens: {
      inputTokens: 0,
      outputTokens: 0,
      embeddingTokens: 0,
    },
  };
  const [code, value] = (await redis.eval(
    CLAIM_SCRIPT,
    3,
    recordKey(input.projectId, key),
    lockKey(input.projectId),
    hourlyKey(input.projectId),
    JSON.stringify(record),
    QUEUED_TTL_MS,
    record.runId,
    HOURLY_LIMIT,
  )) as [number, string];
  if (code === 0)
    return {
      claimed: false,
      estimate: JSON.parse(value) as TopicCostEstimate,
    };
  if (code === 2)
    throw new TooManyRequestsError(
      "Another cost estimate is running for this project. Try again in a minute.",
    );
  if (code === 3)
    throw new TooManyRequestsError(
      "Too many cost estimates this hour. Try again later.",
    );
  return { claimed: true, estimate: record };
}

/** Claims an estimate and enqueues its job; returns the existing one when not claimed. */
export async function startTopicCostEstimate(
  input: TopicCostEstimateStart,
): Promise<TopicCostEstimate> {
  const { claimed, estimate } = await claimTopicCostEstimate(input);
  if (!claimed) return estimate;
  try {
    await enqueueTopicCostEstimate(
      input.projectId,
      estimate.key,
      estimate.runId,
    );
  } catch (error) {
    await finishTopicCostEstimate(input.projectId, {
      ...estimate,
      status: "failed",
      finishedAt: Date.now(),
      error: "Could not start the estimate.",
    });
    throw error;
  }
  return estimate;
}

/** Marks a queued estimate as started by its job; false once the record is no longer this run's. */
export async function markTopicCostEstimateStarted(
  projectId: string,
  record: TopicCostEstimate,
): Promise<boolean> {
  return writeRecord(projectId, record, RUNNING_TTL_MS, false);
}

export async function finishTopicCostEstimate(
  projectId: string,
  record: TopicCostEstimate,
): Promise<boolean> {
  return writeRecord(
    projectId,
    record,
    record.status === "done" ? DONE_TTL_MS : FAILED_TTL_MS,
    true,
  );
}

async function writeRecord(
  projectId: string,
  record: TopicCostEstimate,
  ttlMs: number,
  release: boolean,
) {
  const written = await redis?.eval(
    WRITE_SCRIPT,
    2,
    recordKey(projectId, record.key),
    lockKey(projectId),
    record.runId,
    JSON.stringify(record),
    ttlMs,
    release ? "1" : "0",
  );
  return written === 1;
}

async function priceUsage(
  projectId: string,
  model: string,
  usageDetails: Record<string, number>,
) {
  const resolved = await findModel({ projectId, model });
  if (!resolved.model) return null;
  return (
    calculateModelUsageCosts({ model: resolved, usageDetails }).total_cost ??
    null
  );
}

/**
 * Prices the measured tokens with the project's model prices at read time, so
 * a price change applies without a new estimate. The prefix is priced as
 * uncached input. Prices apply to the average request of one trace: usage
 * thresholds such as large-context tiers hold per request, not per sample.
 */
export async function priceTopicCostEstimate(
  projectId: string,
  record: TopicCostEstimate,
): Promise<TopicCostEstimatePrices> {
  const { tokens, sampled, summarizable, inputs } = record;
  const mean = (total: number) => (summarizable > 0 ? total / summarizable : 0);
  const embeddingTokens = mean(tokens.embeddingTokens);
  const summaryInput = mean(tokens.inputTokens);
  const summaryOutput = mean(tokens.outputTokens);
  const [summary, embedding] = await Promise.all([
    // Summary calls also record total, so a price defined only on total applies here too.
    priceUsage(projectId, inputs.summaryModel, {
      input: summaryInput,
      output: summaryOutput,
      total: summaryInput + summaryOutput,
    }),
    inputs.embeddingModel
      ? // Embedding calls record their tokens as both input and total, and default prices use total.
        priceUsage(projectId, inputs.embeddingModel, {
          input: embeddingTokens,
          total: embeddingTokens,
        })
      : Promise.resolve(0),
  ]);
  const summaryPriced = summary !== null;
  const embeddingPriced = embedding !== null;
  return {
    // Skipped traces cost nothing, so the average spreads over every sampled trace.
    perTraceUsd:
      summaryPriced && embeddingPriced && sampled > 0
        ? ((summary + embedding) * summarizable) / sampled
        : null,
    summaryPriced,
    embeddingPriced,
  };
}
