import { Queue } from "bullmq";
import { QueueName, type TQueueJobTypes } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class MonitorQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.MonitorQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.MonitorQueue]
  > | null {
    if (MonitorQueue.instance) return MonitorQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    MonitorQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.MonitorQueue]>(
          QueueName.MonitorQueue,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.MonitorQueue),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 100,
              attempts: 1,
            },
          },
        )
      : null;

    MonitorQueue.instance?.on("error", (err) => {
      logger.error("MonitorQueue error", err);
    });

    return MonitorQueue.instance;
  }
}
