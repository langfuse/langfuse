import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export const MIXPANEL_SYNC_CRON_PATTERN = "30 * * * *"; // every hour at :30

export class MixpanelIntegrationQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (MixpanelIntegrationQueue.instance) {
      return MixpanelIntegrationQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    MixpanelIntegrationQueue.instance = newRedis
      ? new Queue(QueueName.MixpanelIntegrationQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.MixpanelIntegrationQueue),
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

    MixpanelIntegrationQueue.instance?.on("error", (err) => {
      logger.error("MixpanelIntegrationQueue error", err);
    });

    if (MixpanelIntegrationQueue.instance) {
      logger.debug("Scheduling jobs for MixpanelIntegrationQueue");
      MixpanelIntegrationQueue.instance
        .add(
          QueueJobs.MixpanelIntegrationJob,
          {},
          {
            repeat: { pattern: MIXPANEL_SYNC_CRON_PATTERN },
          },
        )
        .catch((err) => {
          logger.error("Error adding MixpanelIntegrationJob schedule", err);
        });
    }

    return MixpanelIntegrationQueue.instance;
  }
}
