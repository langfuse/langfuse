import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export const KUBIT_SYNC_CRON_PATTERN = "*/15 * * * *"; // every 15 minutes — scheduler checks per-project syncIntervalMinutes

export class KubitIntegrationQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (KubitIntegrationQueue.instance) {
      return KubitIntegrationQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    KubitIntegrationQueue.instance = newRedis
      ? new Queue(QueueName.KubitIntegrationQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.KubitIntegrationQueue),
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

    KubitIntegrationQueue.instance?.on("error", (err) => {
      logger.error("KubitIntegrationQueue error", err);
    });

    if (KubitIntegrationQueue.instance) {
      logger.debug("Scheduling jobs for KubitIntegrationQueue");
      KubitIntegrationQueue.instance
        .add(
          QueueJobs.KubitIntegrationJob,
          {},
          {
            repeat: { pattern: KUBIT_SYNC_CRON_PATTERN },
          },
        )
        .catch((err) => {
          logger.error("Error adding KubitIntegrationJob schedule", err);
        });
    }

    return KubitIntegrationQueue.instance;
  }
}
