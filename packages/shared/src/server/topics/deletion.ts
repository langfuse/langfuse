import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { prisma } from "../../db";
import { InvalidRequestError } from "../../errors/InvalidRequestError";
import type { TopicRule } from "../../topics";
import { QueueJobs, QueueName, type TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "../redis/redis";
import { logger } from "../logger";
import { invalidateProjectEvalConfigCaches } from "../evalJobConfigCache";
import { isTopicsEnabled } from "./config";
import { TOPICS_ACTION } from "./execution-store";
import { listTopicRules } from "./postgres";
import { markTopicSummariesDeleted } from "./clickhouse";
import { topicRuleWhere } from "./processing-gate";

// Jobs enqueued before the delete keep writing for up to a minute (per-pod rule and map caches).
const SWEEP_DELAY_MS = 10 * 60_000;

/** Deletes Topics ClickHouse rows after their Postgres rows are gone. */
export class TopicsDeleteQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.TopicsDelete]
  > | null = null;

  static getInstance() {
    if (!isTopicsEnabled()) return null;
    if (this.instance) return this.instance;
    const options = createBullMQQueueOptionsWithRedis(QueueName.TopicsDelete);
    if (!options) return null;
    this.instance = new Queue<TQueueJobTypes[QueueName.TopicsDelete]>(
      QueueName.TopicsDelete,
      {
        ...options,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 604800, count: 1000 },
        },
      },
    );
    this.instance.on("error", (error) =>
      logger.error("TopicsDeleteQueue error", error),
    );
    return this.instance;
  }
}

function requireDeleteQueue() {
  const queue = TopicsDeleteQueue.getInstance();
  if (!queue) throw new Error("The Topics delete queue is unavailable.");
  return queue;
}

/** Deletes now so the UI empties quickly, and once more for late writes. */
async function enqueueTopicRowsDelete(
  queue: NonNullable<ReturnType<typeof TopicsDeleteQueue.getInstance>>,
  payload: TQueueJobTypes[QueueName.TopicsDelete]["payload"],
) {
  for (const delay of [0, SWEEP_DELAY_MS])
    await queue.add(
      QueueJobs.TopicsDelete,
      {
        id: randomUUID(),
        timestamp: new Date(),
        name: QueueJobs.TopicsDelete,
        payload,
      },
      { delay },
    );
}

/** Deletes a rule and its maps; summaries stay, as other rules share them. */
export async function deleteTopicRule(
  projectId: string,
  ruleId: string,
): Promise<void> {
  const queue = requireDeleteQueue();
  const runIds = await prisma.$transaction(async (tx) => {
    const deleted = await tx.evaluationRule.deleteMany({
      where: { ...topicRuleWhere(projectId), id: ruleId },
    });
    if (!deleted.count)
      throw new InvalidRequestError("Topic rule not found in this project.");
    const runs = await tx.topicClusteringRun.findMany({
      where: { projectId, ruleId },
      select: { id: true },
    });
    await tx.topicClusteringRun.deleteMany({ where: { projectId, ruleId } });
    return runs.map((run) => run.id);
  });
  await invalidateProjectEvalConfigCaches(projectId);
  await enqueueTopicRowsDelete(queue, { projectId, runIds });
}

/**
 * Deletes every Topics rule, analysis, clustering run, topic and summary of
 * the project. Facets and model settings stay. Returns the deleted rules.
 */
export async function resetTopicsData(projectId: string): Promise<TopicRule[]> {
  const queue = requireDeleteQueue();
  const rules = await listTopicRules(projectId);
  await prisma.$transaction([
    prisma.evaluationRule.deleteMany({ where: topicRuleWhere(projectId) }),
    prisma.topicClusteringRun.deleteMany({ where: { projectId } }),
    prisma.batchAction.deleteMany({
      where: { projectId, actionType: TOPICS_ACTION },
    }),
  ]);
  await invalidateProjectEvalConfigCaches(projectId);
  await enqueueTopicRowsDelete(queue, { projectId });
  await markTopicSummariesDeleted(projectId);
  return rules;
}
