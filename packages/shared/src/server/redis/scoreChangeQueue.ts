import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { logger } from "../logger";
import { createBullMQQueueOptionsWithRedis } from "./redis";

export class ScoreChangeQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.ScoreChangeQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.ScoreChangeQueue]
  > | null {
    if (ScoreChangeQueue.instance) return ScoreChangeQueue.instance;

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.ScoreChangeQueue,
    );
    ScoreChangeQueue.instance = queueOptionsWithRedis
      ? new Queue<TQueueJobTypes[QueueName.ScoreChangeQueue]>(
          QueueName.ScoreChangeQueue,
          {
            ...queueOptionsWithRedis,
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

    ScoreChangeQueue.instance?.on("error", (error) => {
      logger.error("ScoreChangeQueue error", error);
    });

    return ScoreChangeQueue.instance;
  }
}
