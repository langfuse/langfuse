import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class TraceDeleteQueue {
  private static instance: Queue<TQueueJobTypes[QueueName.TraceDelete]> | null =
    null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.TraceDelete]
  > | null {
    if (TraceDeleteQueue.instance) return TraceDeleteQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    TraceDeleteQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.TraceDelete]>(
          QueueName.TraceDelete,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.TraceDelete),
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

    TraceDeleteQueue.instance?.on("error", (err) => {
      logger.error("TraceDeleteQueue error", err);
    });

    return TraceDeleteQueue.instance;
  }
}
