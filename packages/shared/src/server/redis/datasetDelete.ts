import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class DatasetDeleteQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.DatasetDelete]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.DatasetDelete]
  > | null {
    if (DatasetDeleteQueue.instance) return DatasetDeleteQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    DatasetDeleteQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.DatasetDelete]>(
          QueueName.DatasetDelete,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.DatasetDelete),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 100_000,
              attempts: 2,
              backoff: {
                type: "exponential",
                delay: 30_000,
              },
            },
          },
        )
      : null;

    DatasetDeleteQueue.instance?.on("error", (err) => {
      logger.error("DatasetDeleteQueue error", err);
    });

    return DatasetDeleteQueue.instance;
  }
}
