import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class ScoreDeleteQueue {
  private static instance: Queue<TQueueJobTypes[QueueName.ScoreDelete]> | null =
    null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.ScoreDelete]
  > | null {
    if (ScoreDeleteQueue.instance) return ScoreDeleteQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    ScoreDeleteQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.ScoreDelete]>(
          QueueName.ScoreDelete,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.ScoreDelete),
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
