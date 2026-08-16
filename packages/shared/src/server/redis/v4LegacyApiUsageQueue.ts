import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

// Every 15 minutes. The worker re-scans a trailing margin each run, so the
// exact minute only affects freshness, not correctness.
export const V4_LEGACY_API_USAGE_CRON_PATTERN = "*/15 * * * *";

export class V4LegacyApiUsageQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (V4LegacyApiUsageQueue.instance) {
      return V4LegacyApiUsageQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.V4LegacyApiUsageQueue,
    );
    V4LegacyApiUsageQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.V4LegacyApiUsageQueue, {
          ...queueOptionsWithRedis,
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 5,
            backoff: {
              type: "exponential",
              delay: 30_000,
            },
          },
        })
      : null;

    V4LegacyApiUsageQueue.instance?.on("error", (err) => {
      logger.error("V4LegacyApiUsageQueue error", err);
    });

    if (V4LegacyApiUsageQueue.instance) {
      logger.debug("Scheduling jobs for V4LegacyApiUsageQueue");
      // Remove the old hourly cron pattern - BullMQ keys repeatable jobs by
      // name + pattern, so changing the pattern creates a second schedule
      // while the old one keeps firing.
      V4LegacyApiUsageQueue.instance
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- Existing repeatable-job cleanup; job scheduler migration should be handled separately.
        .removeRepeatable(QueueJobs.V4LegacyApiUsageJob, {
          pattern: "25 * * * *",
        })
        .catch((err) => {
          logger.error(
            "Error removing legacy V4LegacyApiUsageJob schedule",
            err,
          );
        });
      V4LegacyApiUsageQueue.instance
        .add(
          QueueJobs.V4LegacyApiUsageJob,
          {},
          {
            repeat: { pattern: V4_LEGACY_API_USAGE_CRON_PATTERN },
          },
        )
        .catch((err) => {
          logger.error("Error adding V4LegacyApiUsageJob schedule", err);
        });
    }

    return V4LegacyApiUsageQueue.instance;
  }
}
