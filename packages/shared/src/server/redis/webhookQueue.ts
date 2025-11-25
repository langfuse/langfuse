import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import {
  createNewRedisInstance,
  getQueuePrefix,
  redisQueueRetryOptions,
} from "./redis";
import { logger } from "../logger";

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
            prefix: getQueuePrefix(QueueName.WebhookQueue),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 100_000,
              attempts: 5,
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
