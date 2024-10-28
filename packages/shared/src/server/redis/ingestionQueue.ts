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
              // We delay the processing by 15s to give the client time to upload all events (creates, updates)
              // to S3 before we process the first batch. This reduces errors due to missing creates for updates.
              delay: 15000,
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
