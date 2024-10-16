import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";

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

    return IngestionQueue.instance;
  }
}
