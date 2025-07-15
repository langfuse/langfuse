import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class DatasetRunItemsDeleteQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.DatasetRunItemsDelete]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.DatasetRunItemsDelete]
  > | null {
    if (DatasetRunItemsDeleteQueue.instance)
      return DatasetRunItemsDeleteQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    DatasetRunItemsDeleteQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.DatasetRunItemsDelete]>(
          QueueName.DatasetRunItemsDelete,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.DatasetRunItemsDelete),
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

    DatasetRunItemsDeleteQueue.instance?.on("error", (err) => {
      logger.error("DatasetRunItemsDeleteQueue error", err);
    });

    return DatasetRunItemsDeleteQueue.instance;
  }
}
