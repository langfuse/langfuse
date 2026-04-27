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
      const legacyRepeatablePatterns = ["20 * * * *", "*/20 * * * *"] as const;

      Promise.all(
        legacyRepeatablePatterns.map((pattern) =>
          // eslint-disable-next-line @typescript-eslint/no-deprecated -- Removes legacy repeatable jobs created before this queue used BullMQ job schedulers.
          BlobStorageIntegrationQueue.instance!.removeRepeatable(
            QueueJobs.BlobStorageIntegrationJob,
            { pattern },
          ),
        ),
      ).catch((err) => {
        logger.error(
          "Error removing legacy BlobStorageIntegrationJob repeatable schedules",
          err,
        );
      });

      BlobStorageIntegrationQueue.instance
        .upsertJobScheduler(
          QueueJobs.BlobStorageIntegrationJob,
          { pattern: "*/20 * * * *" }, // every 20 minutes
          {
            name: QueueJobs.BlobStorageIntegrationJob,
            data: {},
          },
        )
        .catch((err) => {
          logger.error(
            "Error upserting BlobStorageIntegrationJob scheduler",
            err,
          );
        });
    }

    return BlobStorageIntegrationQueue.instance;
  }
}
