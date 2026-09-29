import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { scheduleRecurringJob } from "./scheduleRecurringJob";
import { logger } from "../logger";

export const MIXPANEL_SYNC_CRON_PATTERN = "30 * * * *"; // every hour at :30

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
      scheduleRecurringJob(MixpanelIntegrationQueue.instance, {
        jobName: QueueJobs.MixpanelIntegrationJob,
        pattern: MIXPANEL_SYNC_CRON_PATTERN,
      });
    }

    return MixpanelIntegrationQueue.instance;
  }
}
