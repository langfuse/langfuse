import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class PostHogIntegrationQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (PostHogIntegrationQueue.instance) {
      return PostHogIntegrationQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    PostHogIntegrationQueue.instance = newRedis
      ? new Queue(QueueName.PostHogIntegrationQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.PostHogIntegrationQueue),
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

    PostHogIntegrationQueue.instance?.on("error", (err) => {
      logger.error("PostHogIntegrationQueue error", err);
    });

    if (PostHogIntegrationQueue.instance) {
      logger.debug("Scheduling jobs for PostHogIntegrationQueue");
      PostHogIntegrationQueue.instance
        .add(
          QueueJobs.PostHogIntegrationJob,
          {},
          {
            repeat: { pattern: "30 * * * *" }, // every hour at 30 minutes past
          },
        )
        .catch((err) => {
          logger.error("Error adding PostHogIntegrationJob schedule", err);
        });
    }

    return PostHogIntegrationQueue.instance;
  }
}
