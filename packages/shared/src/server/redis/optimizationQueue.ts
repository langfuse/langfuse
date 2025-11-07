import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class OptimizationQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.OptimizationQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.OptimizationQueue]
  > | null {
    if (OptimizationQueue.instance) return OptimizationQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    OptimizationQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.OptimizationQueue]>(
          QueueName.OptimizationQueue,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.OptimizationQueue),
            defaultJobOptions: {
              removeOnComplete: 100, // Keep last 100 completed jobs for status polling
              removeOnFail: 1_000,
              attempts: 3,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    OptimizationQueue.instance?.on("error", (err) => {
      logger.error("OptimizationQueue error", err);
    });

    return OptimizationQueue.instance;
  }
}
