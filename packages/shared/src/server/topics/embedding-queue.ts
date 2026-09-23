import { createHash } from "node:crypto";
import { Queue } from "bullmq";
import { env } from "../../env";
import {
  topicEmbeddingConfigSchema,
  type TopicEmbeddingConfig,
  type TopicSummary,
} from "../../topics";
import { logger } from "../logger";
import {
  QueueJobs,
  QueueName,
  TopicEmbeddingBatchSchema,
  type TQueueJobTypes,
} from "../queues";
import { createBullMQQueueOptionsWithRedis, redis } from "../redis/redis";
import { isTopicsEnabled } from "./config";

export type TopicEmbeddingBatch =
  TQueueJobTypes[QueueName.TopicsEmbedding]["payload"];
export type TopicEmbeddingRef = TopicEmbeddingBatch["summaries"][number];
type BatchScope = Pick<TopicEmbeddingBatch, "projectId" | "executionId">;
type StagedSummary = {
  executionId: string;
  summary: TopicSummary;
  embeddingConfig: TopicEmbeddingConfig;
};

export const TOPIC_EMBEDDING_EXPIRED_ERROR =
  "Topics staged results expired before processing completed. Start a new execution with stored-summary reuse to recover persisted results.";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function summaryKey(
  scope: BatchScope,
  ref: Pick<TopicEmbeddingRef, "facetId" | "facetVersion" | "traceId">,
) {
  return `topics:summary:${hash([
    scope.projectId,
    scope.executionId,
    ref.facetId,
    ref.facetVersion,
    ref.traceId,
  ])}`;
}

function getRedis() {
  if (!redis) throw new Error("Topics summary staging requires Redis.");
  return redis;
}

function decodeStagedSummary(
  value: string,
  scope: BatchScope,
  ref: Pick<TopicEmbeddingRef, "facetId" | "facetVersion" | "traceId"> & {
    summaryId?: string;
  },
): StagedSummary {
  const staged = JSON.parse(value) as StagedSummary;
  if (
    staged.summary?.projectId !== scope.projectId ||
    staged.executionId !== scope.executionId ||
    staged.summary.facetId !== ref.facetId ||
    staged.summary.facetVersion !== ref.facetVersion ||
    staged.summary.traceId !== ref.traceId ||
    (ref.summaryId !== undefined && staged.summary.id !== ref.summaryId)
  )
    throw new Error("Topics staged summary scope mismatch.");
  return {
    executionId: staged.executionId,
    summary: staged.summary,
    embeddingConfig: topicEmbeddingConfigSchema.parse(staged.embeddingConfig),
  };
}

/** The first accepted summary owns the key and its expiry; retries do not renew it. */
export async function stageTopicSummary(
  scope: BatchScope,
  summary: TopicSummary,
  embeddingConfig: TopicEmbeddingConfig,
): Promise<TopicSummary> {
  if (summary.projectId !== scope.projectId)
    throw new Error("Topics staged summary scope mismatch.");
  if (summary.traceId === null)
    throw new Error("Topics processing requires a trace summary.");
  const client = getRedis();
  const key = summaryKey(scope, summary);
  const payload = JSON.stringify({
    executionId: scope.executionId,
    summary,
    embeddingConfig: topicEmbeddingConfigSchema.parse(embeddingConfig),
  });
  const inserted = await client.set(
    key,
    payload,
    "EX",
    env.LANGFUSE_TOPICS_REDIS_TTL_SECONDS,
    "NX",
  );
  if (inserted) return summary;
  const existing = await client.get(key);
  if (!existing) throw new Error(TOPIC_EMBEDDING_EXPIRED_ERROR);
  const staged = decodeStagedSummary(existing, scope, summary);
  if (
    staged.embeddingConfig.embeddingModel !== embeddingConfig.embeddingModel ||
    staged.embeddingConfig.embeddingDimensions !==
      embeddingConfig.embeddingDimensions
  )
    throw new Error("Topics staged summary embedding configuration mismatch.");
  return staged.summary;
}

export async function readStagedTopicSummaries(
  projectId: string,
  executionId: string,
  facetId: string,
  facetVersion: number,
  traceIds: string[],
): Promise<TopicSummary[]> {
  const client = getRedis();
  const scope = { projectId, executionId };
  // Individual GETs remain routable across Redis Cluster slots.
  const values = await Promise.all(
    traceIds.map(async (traceId) => {
      const ref = { facetId, facetVersion, traceId };
      const value = await client.get(summaryKey(scope, ref));
      return value ? decodeStagedSummary(value, scope, ref).summary : null;
    }),
  );
  return values.filter((value): value is TopicSummary => value !== null);
}

export async function readStagedTopicSummary(
  scope: BatchScope,
  ref: TopicEmbeddingRef,
): Promise<StagedSummary | null> {
  const value = await getRedis().get(summaryKey(scope, ref));
  return value ? decodeStagedSummary(value, scope, ref) : null;
}

/** Return the accepted result without extending or resurrecting its payload. */
export async function updateStagedTopicSummary(
  scope: BatchScope,
  ref: TopicEmbeddingRef,
  summary: TopicSummary,
): Promise<TopicSummary | null> {
  const client = getRedis();
  const key = summaryKey(scope, ref);
  const value = await client.get(key);
  if (!value) return null;
  const existing = decodeStagedSummary(value, scope, ref);
  if (existing.summary.state !== "summarized") return existing.summary;
  const replacement = JSON.stringify({ ...existing, summary });
  decodeStagedSummary(replacement, scope, ref);
  const accepted = await client.eval(
    `local current = redis.call('GET', KEYS[1])
     if current == ARGV[1] then
       redis.call('SET', KEYS[1], ARGV[2], 'XX', 'KEEPTTL')
       return ARGV[2]
     end
     return current`,
    1,
    key,
    value,
    replacement,
  );
  return typeof accepted === "string"
    ? decodeStagedSummary(accepted, scope, ref).summary
    : null;
}

export async function deleteStagedTopicSummary(
  scope: BatchScope,
  ref: TopicEmbeddingRef,
): Promise<void> {
  const client = getRedis();
  const key = summaryKey(scope, ref);
  const value = await client.get(key);
  if (!value) return;
  decodeStagedSummary(value, scope, ref);
  await client.eval(
    `if redis.call('GET', KEYS[1]) == ARGV[1] then
       return redis.call('DEL', KEYS[1])
     end
     return 0`,
    1,
    key,
    value,
  );
}

export class TopicsEmbeddingQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.TopicsEmbedding]
  > | null = null;

  static getInstance() {
    if (!isTopicsEnabled()) return null;
    if (this.instance) return this.instance;
    const options = createBullMQQueueOptionsWithRedis(
      QueueName.TopicsEmbedding,
    );
    if (!options) return null;
    this.instance = new Queue<TQueueJobTypes[QueueName.TopicsEmbedding]>(
      QueueName.TopicsEmbedding,
      {
        ...options,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 604800, count: 1000 },
        },
      },
    );
    this.instance.on("error", (error) =>
      logger.error("TopicsEmbeddingQueue error", error),
    );
    return this.instance;
  }
}

export async function enqueueTopicEmbeddingBatch(
  input: TopicEmbeddingBatch,
  options: { retryFailed?: boolean } = {},
): Promise<"pending" | "complete"> {
  const batch = TopicEmbeddingBatchSchema.parse(input);
  const queue = TopicsEmbeddingQueue.getInstance();
  if (!queue)
    throw new Error("Topics requires the local development server and Redis.");
  const jobId = hash([batch.projectId, batch.executionId, batch.batchId]);
  const job = await queue.getJob(jobId);
  if (job) {
    if (hash(job.data.payload) !== hash(batch))
      throw new Error("Topics embedding batch scope mismatch.");
    const state = await job.getState();
    if (state === "completed") return "complete";
    if (state === "failed") {
      if (!options.retryFailed)
        throw new Error(
          job.failedReason === TOPIC_EMBEDDING_EXPIRED_ERROR
            ? TOPIC_EMBEDDING_EXPIRED_ERROR
            : "Topics embedding batch failed. Check worker logs, then resume the execution.",
        );
      try {
        await job.retry("failed", { resetAttemptsMade: true });
      } catch (error) {
        if (
          !["active", "waiting", "delayed", "prioritized"].includes(
            await job.getState(),
          )
        )
          throw error;
      }
    }
    return "pending";
  }
  await queue.add(
    QueueJobs.TopicsEmbedding,
    {
      id: jobId,
      name: QueueJobs.TopicsEmbedding,
      timestamp: new Date(),
      payload: batch,
    },
    { jobId },
  );
  return "pending";
}

/** Poll queue state without loading summary references or touching domain storage. */
export async function getTopicEmbeddingBatchState(
  scope: BatchScope,
  batchId: string,
): Promise<"pending" | "complete" | "failed" | "missing"> {
  const queue = TopicsEmbeddingQueue.getInstance();
  if (!queue) throw new Error("Topics embedding status requires Redis.");
  const state = await queue.getJobState(
    hash([scope.projectId, scope.executionId, batchId]),
  );
  if (state === "completed") return "complete";
  if (state === "failed") return "failed";
  if (state === "unknown") return "missing";
  return "pending";
}
