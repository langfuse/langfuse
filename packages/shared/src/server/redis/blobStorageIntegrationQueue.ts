import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { scheduleRecurringJob } from "./scheduleRecurringJob";
import { logger } from "../logger";

export class BlobStorageIntegrationQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (BlobStorageIntegrationQueue.instance) {
      return BlobStorageIntegrationQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.BlobStorageIntegrationQueue,
    );
    BlobStorageIntegrationQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.BlobStorageIntegrationQueue, {
          ...queueOptionsWithRedis,
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

    BlobStorageIntegrationQueue.instance?.on("error", (err) => {
      logger.error("BlobStorageIntegrationQueue error", err);
    });

    if (BlobStorageIntegrationQueue.instance) {
      logger.debug("Scheduling jobs for BlobStorageIntegrationQueue");
      scheduleRecurringJob(BlobStorageIntegrationQueue.instance, {
        jobName: QueueJobs.BlobStorageIntegrationJob,
        pattern: "*/20 * * * *", // every 20 minutes
        previousPatterns: ["20 * * * *"], // old hourly schedule
      });
    }

    return BlobStorageIntegrationQueue.instance;
  }
}
