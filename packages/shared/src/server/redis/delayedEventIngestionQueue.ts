import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class DelayedEventIngestionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.DelayedEventIngestionQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.DelayedEventIngestionQueue]
  > | null {
    if (DelayedEventIngestionQueue.instance) {
      return DelayedEventIngestionQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    DelayedEventIngestionQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.DelayedEventIngestionQueue]>(
          QueueName.DelayedEventIngestionQueue,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.DelayedEventIngestionQueue),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 100_000,
              attempts: 6,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    DelayedEventIngestionQueue.instance?.on("error", (err) => {
      logger.error("DelayedEventIngestionQueue error", err);
    });

    return DelayedEventIngestionQueue.instance;
  }
}
