import { Queue } from "bullmq";
import { QueueJobs, QueueName, type TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "../redis/redis";
import { logger } from "../logger";
import { isTopicsEnabled } from "./config";
import type { TopicOperation } from "../../topics";

const ownsExecution = (state: string) =>
  ["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(
    state,
  );

type TopicsJob = TQueueJobTypes[QueueName.Topics];

function createTopicsQueue(
  queueName: QueueName.Topics | QueueName.TopicsUpdate,
): Queue<TopicsJob> | null {
  const options = createBullMQQueueOptionsWithRedis(queueName);
  if (!options) return null;
  const queue = new Queue<TopicsJob>(queueName, {
    ...options,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 1000 },
    },
  });
  queue.on("error", (error) => logger.error(`${queueName} queue error`, error));
  return queue;
}

export class TopicsQueue {
  private static instance: Queue<TopicsJob> | null = null;

  static getInstance(): Queue<TopicsJob> | null {
    if (!isTopicsEnabled()) return null;
    if (!this.instance) this.instance = createTopicsQueue(QueueName.Topics);
    return this.instance;
  }
}

export class TopicsUpdateQueue {
  private static instance: Queue<TopicsJob> | null = null;

  static getInstance(): Queue<TopicsJob> | null {
    if (!isTopicsEnabled()) return null;
    if (!this.instance)
      this.instance = createTopicsQueue(QueueName.TopicsUpdate);
    return this.instance;
  }
}

const executionQueue = (operation: TopicOperation) =>
  operation === "process"
    ? TopicsQueue.getInstance()
    : TopicsUpdateQueue.getInstance();

/** A running journal is recoverable only after its queue job loses ownership. */
export async function getTopicExecutionQueueState(
  projectId: string,
  executionId: string,
  operation: TopicOperation,
) {
  const queue = executionQueue(operation);
  if (!queue)
    throw new Error("Topics requires the local development server and Redis.");
  const job = await queue.getJob(executionId);
  if (
    !job ||
    job.data.payload.projectId !== projectId ||
    job.data.payload.executionId !== executionId
  )
    return "missing" as const;
  return job.getState();
}

export async function enqueueTopicExecution(
  projectId: string,
  executionId: string,
  operation: TopicOperation,
): Promise<void> {
  const queue = executionQueue(operation);
  if (!queue)
    throw new Error("Topics requires the local development server and Redis.");
  const job = await queue.getJob(executionId);
  if (job) {
    if (
      job.data.payload.projectId !== projectId ||
      job.data.payload.executionId !== executionId
    )
      throw new Error("Topics queue job scope mismatch.");
    const state = await job.getState();
    if (ownsExecution(state)) return;
    if (state !== "failed" && state !== "completed")
      throw new Error("Topics queue job is not ready to resume.");
    try {
      await job.retry(state);
    } catch (error) {
      // Another retry can already own the job after the state read.
      if (!ownsExecution(await job.getState())) throw error;
    }
    return;
  }
  await queue.add(
    QueueJobs.Topics,
    {
      id: executionId,
      name: QueueJobs.Topics,
      timestamp: new Date(),
      payload: { projectId, executionId },
    },
    { jobId: executionId },
  );
}
