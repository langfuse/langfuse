import { Queue } from "bullmq";
import { env } from "../../env";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class CloudFreeTierUsageThresholdQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    // Only enable in cloud deployments with Stripe configured
    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      return null;
    }

    if (CloudFreeTierUsageThresholdQueue.instance) {
      return CloudFreeTierUsageThresholdQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    CloudFreeTierUsageThresholdQueue.instance = newRedis
      ? new Queue(QueueName.CloudFreeTierUsageThresholdQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.CloudFreeTierUsageThresholdQueue),
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

    CloudFreeTierUsageThresholdQueue.instance?.on("error", (err) => {
      logger.error("CloudFreeTierUsageThresholdQueue error", err);
    });

    if (CloudFreeTierUsageThresholdQueue.instance) {
      logger.info("[CloudFreeTierUsageThresholdQueue] Scheduling recurring job", {
        pattern: "35 * * * *",
        jobId: "cloud-free-tier-usage-threshold-recurring",
        timestamp: new Date().toISOString(),
      });
      CloudFreeTierUsageThresholdQueue.instance.add(
        QueueJobs.CloudFreeTierUsageThresholdJob,
        {},
        {
          // Run at minute 35 of every hour (30 minutes after cloudUsageMetering at :05)
          repeat: { pattern: "35 * * * *" },
          jobId: "cloud-free-tier-usage-threshold-recurring", // Unique ID prevents duplicate recurring jobs
        },
      );

      logger.info("[CloudFreeTierUsageThresholdQueue] Scheduling bootstrap job", {
        jobId: "cloud-free-tier-usage-threshold-bootstrap",
        timestamp: new Date().toISOString(),
      });
      // Bootstrap job to run immediately on startup
      CloudFreeTierUsageThresholdQueue.instance.add(
        QueueJobs.CloudFreeTierUsageThresholdJob,
        {},
        {
          jobId: "cloud-free-tier-usage-threshold-bootstrap", // Unique ID prevents duplicate bootstrap jobs
        },
      );
    }

    return CloudFreeTierUsageThresholdQueue.instance;
  }
}
