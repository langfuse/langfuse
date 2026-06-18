import { Queue } from "bullmq";
import { QueueName } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class BlobStorageIntegrationProcessingQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (BlobStorageIntegrationProcessingQueue.instance) {
      return BlobStorageIntegrationProcessingQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.BlobStorageIntegrationProcessingQueue,
    );
    BlobStorageIntegrationProcessingQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.BlobStorageIntegrationProcessingQueue, {
          ...queueOptionsWithRedis,
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: true,
            attempts: 5,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    BlobStorageIntegrationProcessingQueue.instance?.on("error", (err) => {
      logger.error("BlobStorageIntegrationProcessingQueue error", err);
    });

    return BlobStorageIntegrationProcessingQueue.instance;
  }
}
