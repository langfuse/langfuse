import { Queue } from "bullmq";
import { QueueName } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class PostHogIntegrationProcessingQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (PostHogIntegrationProcessingQueue.instance) {
      return PostHogIntegrationProcessingQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    PostHogIntegrationProcessingQueue.instance = newRedis
      ? new Queue(QueueName.PostHogIntegrationProcessingQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.PostHogIntegrationProcessingQueue),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100_000,
            attempts: 5,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    PostHogIntegrationProcessingQueue.instance?.on("error", (err) => {
      logger.error("PostHogIntegrationProcessingQueue error", err);
    });

    return PostHogIntegrationProcessingQueue.instance;
  }
}
