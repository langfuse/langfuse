import { Queue } from "bullmq";
import { QueueName, type TQueueJobTypes } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class InAppAgentRunQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.InAppAgentRunQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.InAppAgentRunQueue]
  > | null {
    if (InAppAgentRunQueue.instance) return InAppAgentRunQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    InAppAgentRunQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.InAppAgentRunQueue]>(
          QueueName.InAppAgentRunQueue,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.InAppAgentRunQueue),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 100,
              // Postgres owns correctness (claim CAS + reconcile-on-read);
              // BullMQ is delivery-only, so never redeliver on its own.
              attempts: 1,
            },
          },
        )
      : null;

    InAppAgentRunQueue.instance?.on("error", (err) => {
      logger.error("InAppAgentRunQueue error", err);
    });

    return InAppAgentRunQueue.instance;
  }
}
