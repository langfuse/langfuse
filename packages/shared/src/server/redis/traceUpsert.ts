import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class TraceUpsertQueue {
  private static instance: Queue<TQueueJobTypes[QueueName.TraceUpsert]> | null =
    null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.TraceUpsert]
  > | null {
    if (TraceUpsertQueue.instance) return TraceUpsertQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    TraceUpsertQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.TraceUpsert]>(
          QueueName.TraceUpsert,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.TraceUpsert),
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

    TraceUpsertQueue.instance?.on("error", (err) => {
      logger.error("TraceUpsertQueue error", err);
    });

    return TraceUpsertQueue.instance;
  }
}
