import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class EventPropagationQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (EventPropagationQueue.instance) {
      return EventPropagationQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    EventPropagationQueue.instance = newRedis
      ? new Queue(QueueName.EventPropagationQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.EventPropagationQueue),
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
      EventPropagationQueue.instance
        .add(
          QueueJobs.EventPropagationJob,
          { timestamp: new Date() },
          {
            repeat: { pattern: "* * * * *" }, // every minute
          },
        )
        .catch((err) => {
          logger.error("Error adding EventPropagationQueue schedule", err);
        });
    }

    return EventPropagationQueue.instance;
  }
}
