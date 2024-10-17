import { Processor, Queue } from "bullmq";
import {
  logger,
  QueueName,
  QueueJobs,
  createNewRedisInstance,
  redisQueueRetryOptions,
} from "@langfuse/shared/src/server";
import { handleCloudUsageMeteringJob } from "../ee/cloudUsageMetering/handleCloudUsageMeteringJob";
import { env } from "../env";

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

export const cloudUsageMeteringQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.CloudUsageMeteringJob) {
    logger.info("Executing Cloud Usage Metering Job", job.data);
    try {
      return await handleCloudUsageMeteringJob(job);
    } catch (error) {
      logger.error("Error executing Cloud Usage Metering Job", error);
      throw error;
    }
  }
};
