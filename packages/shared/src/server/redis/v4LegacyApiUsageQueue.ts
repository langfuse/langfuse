import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { scheduleRecurringJob } from "./scheduleRecurringJob";
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
      scheduleRecurringJob(V4LegacyApiUsageQueue.instance, {
        jobName: QueueJobs.V4LegacyApiUsageJob,
        pattern: V4_LEGACY_API_USAGE_CRON_PATTERN,
        previousPatterns: ["25 * * * *"], // old hourly schedule
      });
    }

    return V4LegacyApiUsageQueue.instance;
  }
}
