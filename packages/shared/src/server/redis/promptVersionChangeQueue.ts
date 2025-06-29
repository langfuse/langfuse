import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";

export class PromptVersionChangeQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.PromptVersionChangeQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.PromptVersionChangeQueue]
  > | null {
    if (PromptVersionChangeQueue.instance) return PromptVersionChangeQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    PromptVersionChangeQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.PromptVersionChangeQueue]>(
          QueueName.PromptVersionChangeQueue,
          {
            connection: newRedis,
            defaultJobOptions: {
              removeOnComplete: 100,
              removeOnFail: 100_000,
              attempts: 3,
              backoff: {
                type: "exponential",
                delay: 2000,
              },
            },
          },
        )
      : null;

    PromptVersionChangeQueue.instance?.on("error", (err) => {
      logger.error("PromptVersionChangeQueue error", err);
    });

    return PromptVersionChangeQueue.instance;
  }
}