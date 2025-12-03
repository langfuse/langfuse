import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class BatchExportQueue {
  private static instance: Queue<TQueueJobTypes[QueueName.BatchExport]> | null =
    null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.BatchExport]
  > | null {
    if (BatchExportQueue.instance) return BatchExportQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    BatchExportQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.BatchExport]>(
          QueueName.BatchExport,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.BatchExport),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 10_000,
              attempts: 8,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    BatchExportQueue.instance?.on("error", (err) => {
      logger.error("BatchExportQueue error", err);
    });

    return BatchExportQueue.instance;
  }
}
