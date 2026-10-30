import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { scheduleRecurringJob } from "./scheduleRecurringJob";
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
      scheduleRecurringJob(DeadLetterRetryQueue.instance, {
        jobName: QueueJobs.DeadLetterRetryJob,
        pattern: "0 */10 * * * *", // every 10 minutes (with seconds precision)
        data: { timestamp: new Date() },
      });
    }

    return DeadLetterRetryQueue.instance;
  }
}
