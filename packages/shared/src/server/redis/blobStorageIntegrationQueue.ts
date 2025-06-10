import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class BlobStorageIntegrationQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (BlobStorageIntegrationQueue.instance) {
      return BlobStorageIntegrationQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    BlobStorageIntegrationQueue.instance = newRedis
      ? new Queue(QueueName.BlobStorageIntegrationQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.BlobStorageIntegrationQueue),
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

    BlobStorageIntegrationQueue.instance?.on("error", (err) => {
      logger.error("BlobStorageIntegrationQueue error", err);
    });

    if (BlobStorageIntegrationQueue.instance) {
      logger.debug("Scheduling jobs for BlobStorageIntegrationQueue");
      BlobStorageIntegrationQueue.instance
        .add(
          QueueJobs.BlobStorageIntegrationJob,
          {},
          {
            repeat: { pattern: "20 * * * *" }, // every hour at 20 minutes past
          },
        )
        .catch((err) => {
          logger.error("Error adding BlobStorageIntegrationJob schedule", err);
        });
    }

    return BlobStorageIntegrationQueue.instance;
  }
}
