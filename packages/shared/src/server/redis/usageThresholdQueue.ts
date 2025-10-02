import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class UsageThresholdQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (UsageThresholdQueue.instance) {
      return UsageThresholdQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    UsageThresholdQueue.instance = newRedis
      ? new Queue(QueueName.FreeTierUsageThresholdQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.FreeTierUsageThresholdQueue),
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

    UsageThresholdQueue.instance?.on("error", (err) => {
      logger.error("UsageThresholdQueue error", err);
    });

    if (UsageThresholdQueue.instance) {
      UsageThresholdQueue.instance.add(
        QueueJobs.FreeTierUsageThresholdJob,
        {},
        {
          // Run at minute 35 of every hour (30 minutes after cloudUsageMetering at :05)
          repeat: { pattern: "35 * * * *" },
        },
      );

      UsageThresholdQueue.instance.add(
        QueueJobs.FreeTierUsageThresholdJob,
        {},
        {},
      );
    }

    return UsageThresholdQueue.instance;
  }
}
