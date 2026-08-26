import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { scheduleRecurringJob } from "./scheduleRecurringJob";
import { logger } from "../logger";

export class EventPropagationQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (EventPropagationQueue.instance) {
      return EventPropagationQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.EventPropagationQueue,
    );
    EventPropagationQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.EventPropagationQueue, {
          ...queueOptionsWithRedis,
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    EventPropagationQueue.instance?.on("error", (err) => {
      logger.error("EventPropagationQueue error", err);
    });

    if (EventPropagationQueue.instance) {
      // Enforce global concurrency of 1 to ensure sequential partition processing.
      // This works together with cursor-based tracking to guarantee ordered processing.
      EventPropagationQueue.instance.setGlobalConcurrency(1).catch(() => {
        logger.warn(
          "Failed to set global concurrency for EventPropagationQueue",
        );
      });

      logger.debug("Scheduling jobs for EventPropagationQueue");
      scheduleRecurringJob(EventPropagationQueue.instance, {
        jobName: QueueJobs.EventPropagationJob,
        pattern: "* * * * *", // every minute
        data: { timestamp: new Date() },
      });
    }

    return EventPropagationQueue.instance;
  }
}
