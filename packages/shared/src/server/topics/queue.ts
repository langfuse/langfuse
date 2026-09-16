import { Queue } from "bullmq";
import { QueueJobs, QueueName, type TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "../redis/redis";
import { logger } from "../logger";
import { isTopicsEnabled } from "./config";

const ownsExecution = (state: string) =>
  ["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(
    state,
  );

export class TopicsQueue {
  private static instance: Queue<TQueueJobTypes[QueueName.Topics]> | null =
    null;

  static getInstance(): Queue<TQueueJobTypes[QueueName.Topics]> | null {
    if (!isTopicsEnabled()) return null;
    if (this.instance) return this.instance;
    const options = createBullMQQueueOptionsWithRedis(QueueName.Topics);
    if (!options) return null;
    this.instance = new Queue<TQueueJobTypes[QueueName.Topics]>(
      QueueName.Topics,
      {
        ...options,
        defaultJobOptions: {
          attempts: 1,
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 604800, count: 1000 },
        },
      },
    );
    this.instance.on("error", (error) =>
      logger.error("TopicsQueue error", error),
    );
    return this.instance;
  }
}

/** A running journal is recoverable only after its queue job loses ownership. */
export async function getTopicExecutionQueueState(
  projectId: string,
  executionId: string,
) {
  const queue = TopicsQueue.getInstance();
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
): Promise<void> {
  const queue = TopicsQueue.getInstance();
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
