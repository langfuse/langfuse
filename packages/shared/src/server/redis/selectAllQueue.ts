import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";

export class SelectAllQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.SelectAllQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.SelectAllQueue]
  > | null {
    if (SelectAllQueue.instance) return SelectAllQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    SelectAllQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.SelectAllQueue]>(
          QueueName.SelectAllQueue,
          {
            connection: newRedis,
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 10_000,
              attempts: 2,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    SelectAllQueue.instance?.on("error", (err) => {
      logger.error("SelectAllQueue error", err);
    });

    return SelectAllQueue.instance;
  }
}
