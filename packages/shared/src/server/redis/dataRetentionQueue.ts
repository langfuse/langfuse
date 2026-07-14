import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class DataRetentionQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (DataRetentionQueue.instance) {
      return DataRetentionQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.DataRetentionQueue,
    );
    DataRetentionQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.DataRetentionQueue, {
          ...queueOptionsWithRedis,
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
      // Remove the old 3:15am cron pattern - BullMQ keys repeatable jobs by
      // name + pattern, so changing the pattern creates a second schedule
      // while the old one keeps firing.
      DataRetentionQueue.instance
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- Existing repeatable-job cleanup; job scheduler migration should be handled separately.
        .removeRepeatable(QueueJobs.DataRetentionJob, {
          pattern: "15 3 * * *",
        })
        .catch((err) => {
          logger.error("Error removing legacy DataRetentionJob schedule", err);
        });
      DataRetentionQueue.instance
        .add(
          QueueJobs.DataRetentionJob,
          {},
          {
            // every day at 2:45am, 30min before the core data S3 export to
            // avoid contending for the same worker postgres connection pools
            repeat: { pattern: "45 2 * * *" },
          },
        )
        .catch((err) => {
          logger.error("Error adding DataRetentionQueue schedule", err);
        });
    }

    return DataRetentionQueue.instance;
  }
}
