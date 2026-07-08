import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class ScoreDeleteQueue {
  private static instance: Queue<TQueueJobTypes[QueueName.ScoreDelete]> | null =
    null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.ScoreDelete]
  > | null {
    if (ScoreDeleteQueue.instance) return ScoreDeleteQueue.instance;

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.ScoreDelete,
    );
    ScoreDeleteQueue.instance = queueOptionsWithRedis
      ? new Queue<TQueueJobTypes[QueueName.ScoreDelete]>(
          QueueName.ScoreDelete,
          {
            ...queueOptionsWithRedis,
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 100_000,
              attempts: 2,
              backoff: {
                type: "exponential",
                delay: 30_000,
              },
            },
          },
        )
      : null;

    ScoreDeleteQueue.instance?.on("error", (err) => {
      logger.error("ScoreDeleteQueue error", err);
    });

    return ScoreDeleteQueue.instance;
  }
}
