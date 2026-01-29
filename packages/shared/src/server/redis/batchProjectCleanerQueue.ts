import { Queue } from "bullmq";
import { QueueName } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class BatchProjectCleanerQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (BatchProjectCleanerQueue.instance) {
      return BatchProjectCleanerQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    BatchProjectCleanerQueue.instance = newRedis
      ? new Queue(QueueName.BatchProjectCleanerQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.BatchProjectCleanerQueue),
        })
      : null;

    BatchProjectCleanerQueue.instance?.on("error", (err) => {
      logger.error("BatchProjectCleanerQueue error", err);
    });

    return BatchProjectCleanerQueue.instance;
  }
}
