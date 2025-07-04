import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import {
  createNewRedisInstance,
  getQueuePrefix,
  redisQueueRetryOptions,
} from "./redis";
import { logger } from "../logger";

export class PromptVersionChangeQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.PromptVersionChangeQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.PromptVersionChangeQueue]
  > | null {
    if (PromptVersionChangeQueue.instance)
      return PromptVersionChangeQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    PromptVersionChangeQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.PromptVersionChangeQueue]>(
          QueueName.PromptVersionChangeQueue,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.PromptVersionChangeQueue),
            defaultJobOptions: {
              removeOnComplete: 100,
              removeOnFail: 100_000,
              attempts: 5,
              backoff: {
                type: "exponential",
                delay: 5000,
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
