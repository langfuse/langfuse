import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class BatchActionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.BatchActionQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.BatchActionQueue]
  > | null {
    if (BatchActionQueue.instance) return BatchActionQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    BatchActionQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.BatchActionQueue]>(
          QueueName.BatchActionQueue,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.BatchActionQueue),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 10_000,
              attempts: 10,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    BatchActionQueue.instance?.on("error", (err) => {
      logger.error("BatchActionQueue error", err);
    });

    return BatchActionQueue.instance;
  }
}
