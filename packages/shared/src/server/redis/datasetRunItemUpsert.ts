import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
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
            defaultJobOptions: {
              removeOnComplete: 100, // Important: If not true, new jobs for that ID would be ignored as jobs in the complete set are still considered as part of the queue
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

    DatasetRunItemUpsertQueue.instance?.on("error", (err) => {
      logger.error("DatasetRunItemUpsertQueue error", err);
    });

    return DatasetRunItemUpsertQueue.instance;
  }
}
