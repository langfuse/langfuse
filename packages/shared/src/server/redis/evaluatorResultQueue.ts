import { Queue } from "bullmq";

import { logger } from "../logger";
import { QueueName, type TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";

export class EvaluatorResultQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.EvaluatorResult]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.EvaluatorResult]
  > | null {
    if (EvaluatorResultQueue.instance) return EvaluatorResultQueue.instance;

    const queueOptions = createBullMQQueueOptionsWithRedis(
      QueueName.EvaluatorResult,
    );
    EvaluatorResultQueue.instance = queueOptions
      ? new Queue<TQueueJobTypes[QueueName.EvaluatorResult]>(
          QueueName.EvaluatorResult,
          {
            ...queueOptions,
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 100_000,
              attempts: 5,
              backoff: { type: "exponential", delay: 5_000 },
            },
          },
        )
      : null;

    EvaluatorResultQueue.instance?.on("error", (error) => {
      logger.error("EvaluatorResultQueue error", error);
    });

    return EvaluatorResultQueue.instance;
  }
}
