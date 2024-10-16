import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { createNewRedisInstance } from "./redis";

export class BatchExportQueue {
  private static instance: Queue<TQueueJobTypes[QueueName.BatchExport]> | null =
    null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.BatchExport]
  > | null {
    if (BatchExportQueue.instance) return BatchExportQueue.instance;

    const newRedis = createNewRedisInstance({ enableOfflineQueue: false });

    BatchExportQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.BatchExport]>(
          QueueName.BatchExport,
          {
            connection: newRedis,
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 10_000,
              attempts: 2,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    return BatchExportQueue.instance;
  }
}
