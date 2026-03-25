import { Queue } from "bullmq";
import { QueueName } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class KubitIntegrationProcessingQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (KubitIntegrationProcessingQueue.instance) {
      return KubitIntegrationProcessingQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    KubitIntegrationProcessingQueue.instance = newRedis
      ? new Queue(QueueName.KubitIntegrationProcessingQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.KubitIntegrationProcessingQueue),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100_000,
            attempts: 5,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    KubitIntegrationProcessingQueue.instance?.on("error", (err) => {
      logger.error("KubitIntegrationProcessingQueue error", err);
    });

    return KubitIntegrationProcessingQueue.instance;
  }
}
