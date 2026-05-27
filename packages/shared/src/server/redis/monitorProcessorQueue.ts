import { Queue } from "bullmq";
import { QueueName, type MonitorQueueEvent } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class MonitorProcessorQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (MonitorProcessorQueue.instance) return MonitorProcessorQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    MonitorProcessorQueue.instance = newRedis
      ? new Queue<MonitorQueueEvent>(QueueName.MonitorProcessorQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.MonitorProcessorQueue),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 1,
          },
        })
      : null;

    MonitorProcessorQueue.instance?.on("error", (err) => {
      logger.error("MonitorProcessorQueue error", err);
    });

    return MonitorProcessorQueue.instance;
  }
}
