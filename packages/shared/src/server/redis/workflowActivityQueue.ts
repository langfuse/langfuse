import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";

export class WorkflowActivityQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.WorkflowActivityQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.WorkflowActivityQueue]
  > | null {
    if (WorkflowActivityQueue.instance) return WorkflowActivityQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    WorkflowActivityQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.WorkflowActivityQueue]>(
          QueueName.WorkflowActivityQueue,
          {
            connection: newRedis,
            defaultJobOptions: {
              removeOnComplete: 100, // Important: If not true, new jobs for that ID would be ignored as jobs in the complete set are still considered as part of the queue
              removeOnFail: 100_000,
              attempts: 5,
              delay: 15_000, // 15 seconds
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    WorkflowActivityQueue.instance?.on("error", (err) => {
      logger.error("WorkflowActivityQueue error", err);
    });

    return WorkflowActivityQueue.instance;
  }
}
