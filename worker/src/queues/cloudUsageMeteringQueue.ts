import { Processor, Queue } from "bullmq";
import {
  logger,
  QueueName,
  QueueJobs,
  createNewRedisInstance,
} from "@langfuse/shared/src/server";
import { handleCloudUsageMeteringJob } from "../ee/cloudUsageMetering/handleCloudUsageMeteringJob";

export class CloudUsageMeteringQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (CloudUsageMeteringQueue.instance)
      return CloudUsageMeteringQueue.instance;

    const newRedis = createNewRedisInstance({ enableOfflineQueue: false });

    CloudUsageMeteringQueue.instance = newRedis
      ? new Queue(QueueName.CloudUsageMeteringQueue, {
          connection: newRedis,
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
