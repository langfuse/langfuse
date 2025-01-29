import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";

export class IngestionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.IngestionQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.IngestionQueue]
  > | null {
    if (IngestionQueue.instance) return IngestionQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    IngestionQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.IngestionQueue]>(
          QueueName.IngestionQueue,
          {
            connection: newRedis,
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

    IngestionQueue.instance?.on("error", (err) => {
      logger.error("IngestionQueue error", err);
    });

    return IngestionQueue.instance;
  }
}

export class SecondaryIngestionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.IngestionSecondaryQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.IngestionSecondaryQueue]
  > | null {
    if (SecondaryIngestionQueue.instance)
      return SecondaryIngestionQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    SecondaryIngestionQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.IngestionSecondaryQueue]>(
          QueueName.IngestionSecondaryQueue,
          {
            connection: newRedis,
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

    SecondaryIngestionQueue.instance?.on("error", (err) => {
      logger.error("SecondaryIngestionQueue error", err);
    });

    return SecondaryIngestionQueue.instance;
  }
}
