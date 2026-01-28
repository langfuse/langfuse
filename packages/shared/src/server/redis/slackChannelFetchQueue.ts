import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class SlackChannelFetchQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.SlackChannelFetchQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.SlackChannelFetchQueue]
  > | null {
    if (SlackChannelFetchQueue.instance) return SlackChannelFetchQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    SlackChannelFetchQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.SlackChannelFetchQueue]>(
          QueueName.SlackChannelFetchQueue,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.SlackChannelFetchQueue),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 1_000,
              attempts: 3,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    SlackChannelFetchQueue.instance?.on("error", (err) => {
      logger.error("SlackChannelFetchQueue error", err);
    });

    return SlackChannelFetchQueue.instance;
  }
}
