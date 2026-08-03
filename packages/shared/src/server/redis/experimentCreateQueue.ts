import { Queue } from "bullmq";
import { logger } from "../logger";
import { TQueueJobTypes, QueueName } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";

export class ExperimentCreateQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.ExperimentCreate]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.ExperimentCreate]
  > | null {
    if (ExperimentCreateQueue.instance) return ExperimentCreateQueue.instance;

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.ExperimentCreate,
    );
    ExperimentCreateQueue.instance = queueOptionsWithRedis
      ? new Queue<TQueueJobTypes[QueueName.ExperimentCreate]>(
          QueueName.ExperimentCreate,
          {
            ...queueOptionsWithRedis,
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

    ExperimentCreateQueue.instance?.on("error", (err) => {
      logger.error("ExperimentCreateQueue error", err);
    });

    return ExperimentCreateQueue.instance;
  }
}
