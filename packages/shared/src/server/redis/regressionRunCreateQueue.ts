import { Queue } from "bullmq";
import { logger } from "../logger";
import { TQueueJobTypes, QueueName } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";

export class RegressionRunCreateQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.RegressionRunCreate]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.RegressionRunCreate]
  > | null {
    if (RegressionRunCreateQueue.instance)
      return RegressionRunCreateQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    RegressionRunCreateQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.RegressionRunCreate]>(
          QueueName.RegressionRunCreate,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.RegressionRunCreate),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 10_000,
              attempts: 10,
              backoff: {
                type: "exponential",
                delay: 10_000, // 10 seconds
              },
            },
          },
        )
      : null;

    RegressionRunCreateQueue.instance?.on("error", (err) => {
      logger.error("RegressionRunCreateQueue error", err);
    });

    return RegressionRunCreateQueue.instance;
  }
}
