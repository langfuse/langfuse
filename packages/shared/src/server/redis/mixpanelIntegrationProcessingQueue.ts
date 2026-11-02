import { Queue } from "bullmq";
import { QueueName } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class MixpanelIntegrationProcessingQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (MixpanelIntegrationProcessingQueue.instance) {
      return MixpanelIntegrationProcessingQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.MixpanelIntegrationProcessingQueue,
    );
    MixpanelIntegrationProcessingQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.MixpanelIntegrationProcessingQueue, {
          ...queueOptionsWithRedis,
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
