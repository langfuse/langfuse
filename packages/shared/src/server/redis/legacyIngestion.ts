import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { createNewRedisInstance } from "./redis";

export class LegacyIngestionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.LegacyIngestionQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.LegacyIngestionQueue]
  > | null {
    if (LegacyIngestionQueue.instance) return LegacyIngestionQueue.instance;

    const newRedis = createNewRedisInstance({ enableOfflineQueue: false });

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

    return LegacyIngestionQueue.instance;
  }
}
