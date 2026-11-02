import { Queue } from "bullmq";
import { env } from "../../env";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { scheduleRecurringJob } from "./scheduleRecurringJob";
import { logger } from "../logger";

export class CloudSpendAlertQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    // Cloud-only, but no longer Stripe-only: ClickHouse-billed orgs run their
    // alerts through the same queue, and a CHB deployment has no Stripe key.
    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      return null;
    }

    if (CloudSpendAlertQueue.instance) {
      return CloudSpendAlertQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.CloudSpendAlertQueue,
    );
    CloudSpendAlertQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.CloudSpendAlertQueue, {
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

    CloudSpendAlertQueue.instance?.on("error", (err) => {
      logger.error("CloudSpendAlertQueue error", err);
    });

    if (CloudSpendAlertQueue.instance) {
      // Stripe-billed orgs are enqueued by the usage metering job (with a
      // 5-minute delay, once it has pushed the hour's meter events). That job
      // only iterates orgs carrying a Stripe customer id, so CHB-billed orgs
      // need their own trigger: this hourly fan-out. It runs at :15 — after
      // metering at :05 and the alert jobs it delays to ~:10, before the
      // free-tier threshold job at :35.
      scheduleRecurringJob(CloudSpendAlertQueue.instance, {
        jobName: QueueJobs.CloudSpendAlertFanOutJob,
        pattern: "15 * * * *",
      });
    }

    return CloudSpendAlertQueue.instance;
  }
}
