import { Queue } from "bullmq";
import { env } from "../../env";
import { QueueName } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class CloudSpendAlertQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (!env.STRIPE_SECRET_KEY) {
      return null;
    }

    if (CloudSpendAlertQueue.instance) {
      return CloudSpendAlertQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    CloudSpendAlertQueue.instance = newRedis
      ? new Queue(QueueName.CloudSpendAlertQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.CloudSpendAlertQueue),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 5,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    CloudSpendAlertQueue.instance?.on("error", (err) => {
      logger.error("CloudSpendAlertQueue error", err);
    });

    // Note: Jobs are triggered by the metering job with 5-minute delays
    // No automatic scheduling needed

    return CloudSpendAlertQueue.instance;
  }
}
