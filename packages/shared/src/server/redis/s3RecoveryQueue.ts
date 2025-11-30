import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class S3RecoveryQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.S3RecoveryQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.S3RecoveryQueue]
  > | null {
    if (S3RecoveryQueue.instance) return S3RecoveryQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    S3RecoveryQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.S3RecoveryQueue]>(
          QueueName.S3RecoveryQueue,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.S3RecoveryQueue),
            defaultJobOptions: {
              removeOnComplete: true,
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

    S3RecoveryQueue.instance?.on("error", (err) => {
      logger.error("S3RecoveryQueue error", err);
    });

    return S3RecoveryQueue.instance;
  }
}
