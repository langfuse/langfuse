import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class DeadLetterRetryQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (DeadLetterRetryQueue.instance) {
      return DeadLetterRetryQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.DeadLetterRetryQueue,
    );
    DeadLetterRetryQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.DeadLetterRetryQueue, {
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

    DeadLetterRetryQueue.instance?.on("error", (err) => {
      logger.error("DeadLetterRetryQueue error", err);
    });

    if (DeadLetterRetryQueue.instance) {
      logger.debug("Scheduling jobs for DeadLetterRetryQueue");
      DeadLetterRetryQueue.instance
        .add(
          QueueJobs.DeadLetterRetryJob,
          { timestamp: new Date() },
          {
            repeat: { pattern: "0 */10 * * * *" }, // every 10 minutes (with seconds precision)
          },
        )
        .catch((err) => {
          logger.error("Error adding DeadLetterRetryQueue schedule", err);
        });
    }

    return DeadLetterRetryQueue.instance;
  }
}
