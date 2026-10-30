import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class ProjectDeleteQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.ProjectDelete]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.ProjectDelete]
  > | null {
    if (ProjectDeleteQueue.instance) return ProjectDeleteQueue.instance;

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.ProjectDelete,
    );
    ProjectDeleteQueue.instance = queueOptionsWithRedis
      ? new Queue<TQueueJobTypes[QueueName.ProjectDelete]>(
          QueueName.ProjectDelete,
          {
            ...queueOptionsWithRedis,
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 100_000,
              attempts: 10,
              delay: 60_000, // 1 minute
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
