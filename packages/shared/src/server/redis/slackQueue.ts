import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";

export class SlackQueue {
  private static instance: Queue<TQueueJobTypes[QueueName.SlackQueue]> | null =
    null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.SlackQueue]
  > | null {
    if (SlackQueue.instance) return SlackQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    SlackQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.SlackQueue]>(QueueName.SlackQueue, {
          connection: newRedis,
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100_000,
            attempts: 5,
            backoff: {
              type: "exponential",
              delay: 5_000,
            },
          },
        })
      : null;

    SlackQueue.instance?.on("error", (err) => {
      logger.error("SlackQueue error", err);
    });

    return SlackQueue.instance;
  }
}
