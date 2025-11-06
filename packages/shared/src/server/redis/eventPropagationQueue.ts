import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { env } from "../../env";
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
      logger.debug(
        `Setting global concurrency for EventPropagationQueue to ${env.LANGFUSE_EVENT_PROPAGATION_WORKER_GLOBAL_CONCURRENCY}`,
      );
      EventPropagationQueue.instance
        .setGlobalConcurrency(
          env.LANGFUSE_EVENT_PROPAGATION_WORKER_GLOBAL_CONCURRENCY,
        )
        .catch(() => {
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
