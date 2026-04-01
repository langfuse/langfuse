import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class DatasetRunItemUpsertQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.DatasetRunItemUpsert]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.DatasetRunItemUpsert]
  > | null {
    if (DatasetRunItemUpsertQueue.instance)
      return DatasetRunItemUpsertQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    DatasetRunItemUpsertQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.DatasetRunItemUpsert]>(
          QueueName.DatasetRunItemUpsert,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.DatasetRunItemUpsert),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 10_000,
              attempts: 5,
              delay: 30_000, // 30 seconds
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    DatasetRunItemUpsertQueue.instance?.on("error", (err) => {
      logger.error("DatasetRunItemUpsertQueue error", err);
    });

    return DatasetRunItemUpsertQueue.instance;
  }
}
