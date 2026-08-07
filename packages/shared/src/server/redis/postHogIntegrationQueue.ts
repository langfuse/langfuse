import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";
import { getBullMQRepeatableJobOptions } from "./repeatableJobs";

export class PostHogIntegrationQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (PostHogIntegrationQueue.instance) {
      return PostHogIntegrationQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.PostHogIntegrationQueue,
    );
    PostHogIntegrationQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.PostHogIntegrationQueue, {
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

    PostHogIntegrationQueue.instance?.on("error", (err) => {
      logger.error("PostHogIntegrationQueue error", err);
    });

    if (PostHogIntegrationQueue.instance) {
      logger.debug("Scheduling jobs for PostHogIntegrationQueue");
      PostHogIntegrationQueue.instance
        .add(
          QueueJobs.PostHogIntegrationJob,
          {},
          {
            repeat: getBullMQRepeatableJobOptions(
              QueueJobs.PostHogIntegrationJob,
            ),
          },
        )
        .catch((err) => {
          logger.error("Error adding PostHogIntegrationJob schedule", err);
        });
    }

    return PostHogIntegrationQueue.instance;
  }
}
