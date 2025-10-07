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
      logger.error("[CloudFreeTierUsageThresholdQueue] error", err);
    });

    if (CloudFreeTierUsageThresholdQueue.instance) {
      // Schedule recurring job - runs every hour at minute 35 (30 minutes after cloudUsageMetering at :05)
      logger.info(
        "[CloudFreeTierUsageThresholdQueue] Scheduling recurring job",
        {
          pattern: "35 * * * *",
          jobId: "free-tier-usage-threshold-hourly",
          description: "Every hour at minute 35",
          timestamp: new Date().toISOString(),
        },
      );

      CloudFreeTierUsageThresholdQueue.instance.add(
        QueueJobs.CloudFreeTierUsageThresholdJob,
        { type: "recurring" },
        {
          repeat: { pattern: "35 * * * *" },
          // jobId: "free-tier-usage-threshold-hourly", // CRITICAL: Unique ID prevents duplicates across containers
        },
      );

      // Optional: Bootstrap job for immediate execution on startup
      // This ensures usage thresholds are processed immediately when service starts
      logger.info(
        "[CloudFreeTierUsageThresholdQueue] Scheduling bootstrap job (commented out for now)",
        {
          jobId: "free-tier-usage-threshold-bootstrap",
          description: "Immediate execution on startup",
          timestamp: new Date().toISOString(),
        },
      );

      // Note: disabled for now
      // ------------------------------------------------------------
      // CloudFreeTierUsageThresholdQueue.instance.add(
      //   QueueJobs.CloudFreeTierUsageThresholdJob,
      //   { type: "bootstrap" },
      //   {
      //     jobId: "free-tier-usage-threshold-bootstrap", // CRITICAL: Unique ID prevents duplicates across containers
      //   },
      // );
    }

    return CloudFreeTierUsageThresholdQueue.instance;
  }
}
