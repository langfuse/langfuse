import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";

export class LegacyIngestionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.LegacyIngestionQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.LegacyIngestionQueue]
  > | null {
    if (LegacyIngestionQueue.instance) return LegacyIngestionQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    LegacyIngestionQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.LegacyIngestionQueue]>(
          QueueName.LegacyIngestionQueue,
          {
            connection: newRedis,
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 500_000,
              attempts: 5,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    LegacyIngestionQueue.instance?.on("error", (err) => {
      logger.error("LegacyIngestionQueue error", err);
    });

    return LegacyIngestionQueue.instance;
  }
}
