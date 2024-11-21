import { Queue } from "bullmq";
import {
  createNewRedisInstance,
  QueueName,
  TQueueJobTypes,
  logger,
  redisQueueRetryOptions,
} from "@langfuse/shared/src/server";

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

    ExperimentCreateQueue.instance?.on("error", (err) => {
      logger.error("ExperimentCreateQueue error", err);
    });

    return ExperimentCreateQueue.instance;
  }
}
