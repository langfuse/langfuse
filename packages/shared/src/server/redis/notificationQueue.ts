import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class NotificationQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.NotificationQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.NotificationQueue]
  > | null {
    if (NotificationQueue.instance) return NotificationQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    NotificationQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.NotificationQueue]>(
          QueueName.NotificationQueue,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.NotificationQueue),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 1_000,
              attempts: 5,
              backoff: {
                type: "exponential",
                delay: 3000,
              },
            },
          },
        )
      : null;

    NotificationQueue.instance?.on("error", (err) => {
      logger.error("NotificationQueue error", err);
    });

    return NotificationQueue.instance;
  }
}
