import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class CreateEvalQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.CreateEvalQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.CreateEvalQueue]
  > | null {
    if (CreateEvalQueue.instance) return CreateEvalQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    CreateEvalQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.CreateEvalQueue]>(
          QueueName.CreateEvalQueue,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.CreateEvalQueue),
            defaultJobOptions: {
              removeOnComplete: 100, // Important: If not true, new jobs for that ID would be ignored as jobs in the complete set are still considered as part of the queue
              removeOnFail: 100_000,
              attempts: 5,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    CreateEvalQueue.instance?.on("error", (err) => {
      logger.error("CreateEvalQueue error", err);
    });

    return CreateEvalQueue.instance;
  }
}
