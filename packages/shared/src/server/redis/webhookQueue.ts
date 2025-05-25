import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";

export const WEBHOOK_ATTEMPTS = 5;
export class WebhookQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.WebhookQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.WebhookQueue]
  > | null {
    if (WebhookQueue.instance) return WebhookQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    WebhookQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.WebhookQueue]>(
          QueueName.WebhookQueue,
          {
            connection: newRedis,
            defaultJobOptions: {
              removeOnComplete: 100, // Important: If not true, new jobs for that ID would be ignored as jobs in the complete set are still considered as part of the queue
              removeOnFail: 100_000,
              attempts: WEBHOOK_ATTEMPTS,
              delay: 15_000, // 15 seconds
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    WebhookQueue.instance?.on("error", (err) => {
      logger.error("WebhookQueue error", err);
    });

    return WebhookQueue.instance;
  }
}
