import { Queue } from "bullmq";
import { logger } from "../logger";
import { TQueueJobTypes, QueueName } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";

export class ExperimentCreateQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.ExperimentCreate]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.ExperimentCreate]
  > | null {
    if (ExperimentCreateQueue.instance) return ExperimentCreateQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    ExperimentCreateQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.ExperimentCreate]>(
          QueueName.ExperimentCreate,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.ExperimentCreate),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 10_000,
              attempts: 10,
              backoff: {
                type: "exponential",
                delay: 1000,
              },
            },
          },
        )
      : null;

    ExperimentCreateQueue.instance?.on("error", (err) => {
      logger.error("ExperimentCreateQueue error", err);
    });

    return ExperimentCreateQueue.instance;
  }
}
