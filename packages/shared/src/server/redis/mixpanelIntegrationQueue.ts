import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";
import { getBullMQRepeatableJobOptions } from "./repeatableJobs";

export class MixpanelIntegrationQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (MixpanelIntegrationQueue.instance) {
      return MixpanelIntegrationQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.MixpanelIntegrationQueue,
    );
    MixpanelIntegrationQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.MixpanelIntegrationQueue, {
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

    MixpanelIntegrationQueue.instance?.on("error", (err) => {
      logger.error("MixpanelIntegrationQueue error", err);
    });

    if (MixpanelIntegrationQueue.instance) {
      logger.debug("Scheduling jobs for MixpanelIntegrationQueue");
      MixpanelIntegrationQueue.instance
        .add(
          QueueJobs.MixpanelIntegrationJob,
          {},
          {
            repeat: getBullMQRepeatableJobOptions(
              QueueJobs.MixpanelIntegrationJob,
            ),
          },
        )
        .catch((err) => {
          logger.error("Error adding MixpanelIntegrationJob schedule", err);
        });
    }

    return MixpanelIntegrationQueue.instance;
  }
}
