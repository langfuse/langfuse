import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";

export class ObservationUpsertQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.ObservationUpsert]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.ObservationUpsert]
  > | null {
    if (ObservationUpsertQueue.instance) return ObservationUpsertQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    ObservationUpsertQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.ObservationUpsert]>(
          QueueName.ObservationUpsert,
          {
            connection: newRedis,
            defaultJobOptions: {
              removeOnComplete: 100, // Important: If not true, new jobs for that ID would be ignored as jobs in the complete set are still considered as part of the queue
              removeOnFail: 100_000,
              attempts: 5,
              delay: 15_000, // 15 seconds
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    ObservationUpsertQueue.instance?.on("error", (err) => {
      logger.error("ObservationUpsertQueue error", err);
    });

    return ObservationUpsertQueue.instance;
  }
}
