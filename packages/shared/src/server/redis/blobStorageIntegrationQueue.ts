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
      // Remove the old hourly cron pattern — BullMQ keys repeatable jobs by
      // name + pattern, so changing the pattern creates a second schedule
      // while the old one keeps firing.
      BlobStorageIntegrationQueue.instance
        .removeRepeatable(QueueJobs.BlobStorageIntegrationJob, {
          pattern: "20 * * * *",
        })
        .catch((err) => {
          logger.error(
            "Error removing legacy BlobStorageIntegrationJob schedule",
            err,
          );
        });
      BlobStorageIntegrationQueue.instance
        .add(
          QueueJobs.BlobStorageIntegrationJob,
          {},
          {
            repeat: { pattern: "*/20 * * * *" }, // every 20 minutes
          },
        )
        .catch((err) => {
          logger.error("Error adding BlobStorageIntegrationJob schedule", err);
        });
    }

    return BlobStorageIntegrationQueue.instance;
  }
}
