import { Queue } from "bullmq";
import { QueueName } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class BatchDataRetentionCleanerQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (BatchDataRetentionCleanerQueue.instance) {
      return BatchDataRetentionCleanerQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    BatchDataRetentionCleanerQueue.instance = newRedis
      ? new Queue(QueueName.BatchDataRetentionCleanerQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.BatchDataRetentionCleanerQueue),
        })
      : null;

    BatchDataRetentionCleanerQueue.instance?.on("error", (err) => {
      logger.error("BatchDataRetentionCleanerQueue error", err);
    });

    return BatchDataRetentionCleanerQueue.instance;
  }
}
