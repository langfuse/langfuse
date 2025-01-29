import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";

export class ProjectDeleteQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.ProjectDelete]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.ProjectDelete]
  > | null {
    if (ProjectDeleteQueue.instance) return ProjectDeleteQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    ProjectDeleteQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.ProjectDelete]>(
          QueueName.ProjectDelete,
          {
            connection: newRedis,
            defaultJobOptions: {
              removeOnComplete: true,
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

    ProjectDeleteQueue.instance?.on("error", (err) => {
      logger.error("ProjectDeleteQueue error", err);
    });

    return ProjectDeleteQueue.instance;
  }
}
