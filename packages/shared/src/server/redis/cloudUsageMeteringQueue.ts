import { Queue } from "bullmq";
import { env } from "../../env";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class CloudUsageMeteringQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (!env.STRIPE_SECRET_KEY) {
      return null;
    }

    if (CloudUsageMeteringQueue.instance) {
      return CloudUsageMeteringQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    CloudUsageMeteringQueue.instance = newRedis
      ? new Queue(QueueName.CloudUsageMeteringQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.CloudUsageMeteringQueue),
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

    CloudUsageMeteringQueue.instance?.on("error", (err) => {
      logger.error("CloudUsageMeteringQueue error", err);
    });

    if (CloudUsageMeteringQueue.instance) {
      CloudUsageMeteringQueue.instance.add(
        QueueJobs.CloudUsageMeteringJob,
        {},
        {
          // Run at minute 5 of every hour (e.g. 1:05, 2:05, 3:05, etc)
          repeat: { pattern: "5 * * * *" },
        },
      );

      CloudUsageMeteringQueue.instance.add(
        QueueJobs.CloudUsageMeteringJob,
        {},
        {},
      );
    }

    return CloudUsageMeteringQueue.instance;
  }
}
