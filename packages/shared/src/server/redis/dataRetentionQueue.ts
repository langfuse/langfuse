import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class DataRetentionQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (DataRetentionQueue.instance) {
      return DataRetentionQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    DataRetentionQueue.instance = newRedis
      ? new Queue(QueueName.DataRetentionQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.DataRetentionQueue),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 5,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    DataRetentionQueue.instance?.on("error", (err) => {
      logger.error("DataRetentionQueue error", err);
    });

    if (DataRetentionQueue.instance) {
      logger.debug("Scheduling jobs for DataRetentionQueue");
      DataRetentionQueue.instance
        .add(
          QueueJobs.DataRetentionJob,
          {},
          {
            repeat: { pattern: "15 3 * * *" }, // every day at 3:15am
          },
        )
        .catch((err) => {
          logger.error("Error adding DataRetentionQueue schedule", err);
        });
    }

    return DataRetentionQueue.instance;
  }
}
