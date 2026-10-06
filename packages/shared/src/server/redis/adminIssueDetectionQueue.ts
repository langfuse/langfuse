import { Queue } from "bullmq";
import { QueueName } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class AdminIssueDetectionQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (AdminIssueDetectionQueue.instance) {
      return AdminIssueDetectionQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.AdminIssueDetectionQueue,
    );
    AdminIssueDetectionQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.AdminIssueDetectionQueue, {
          ...queueOptionsWithRedis,
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 1,
          },
        })
      : null;

    AdminIssueDetectionQueue.instance?.on("error", (err) => {
      logger.error("AdminIssueDetectionQueue error", err);
    });

    return AdminIssueDetectionQueue.instance;
  }
}
