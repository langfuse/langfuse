import { Queue } from "bullmq";
import { QueueName } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class MixpanelIntegrationProcessingQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (MixpanelIntegrationProcessingQueue.instance) {
      return MixpanelIntegrationProcessingQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    MixpanelIntegrationProcessingQueue.instance = newRedis
      ? new Queue(QueueName.MixpanelIntegrationProcessingQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.MixpanelIntegrationProcessingQueue),
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

    MixpanelIntegrationProcessingQueue.instance?.on("error", (err) => {
      logger.error("MixpanelIntegrationProcessingQueue error", err);
    });

    return MixpanelIntegrationProcessingQueue.instance;
  }
}
