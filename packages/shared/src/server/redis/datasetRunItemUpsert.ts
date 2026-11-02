import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import { createBullMQQueueOptionsWithRedis } from "./redis";
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

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.DatasetRunItemUpsert,
    );
    DatasetRunItemUpsertQueue.instance = queueOptionsWithRedis
      ? new Queue<TQueueJobTypes[QueueName.DatasetRunItemUpsert]>(
          QueueName.DatasetRunItemUpsert,
          {
            ...queueOptionsWithRedis,
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
