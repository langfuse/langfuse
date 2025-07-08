import { Queue } from "bullmq";
import { QueueName } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class DataRetentionProcessingQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (DataRetentionProcessingQueue.instance) {
      return DataRetentionProcessingQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    DataRetentionProcessingQueue.instance = newRedis
      ? new Queue(QueueName.DataRetentionProcessingQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.DataRetentionProcessingQueue),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 10000,
            attempts: 5,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    DataRetentionProcessingQueue.instance?.on("error", (err) => {
      logger.error("DataRetentionProcessingQueue error", err);
    });

    return DataRetentionProcessingQueue.instance;
  }
}
