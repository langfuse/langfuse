import { Queue } from "bullmq";
import { logger } from "../logger";
import { QueueName, type TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "../redis/redis";
import { isTopicsEnabled } from "./config";

/** Assigns automatically summarized traces to their facet's serving map. */
export class TopicsAutomationQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.TopicsAutomation]
  > | null = null;

  static getInstance() {
    if (!isTopicsEnabled()) return null;
    if (this.instance) return this.instance;
    const options = createBullMQQueueOptionsWithRedis(
      QueueName.TopicsAutomation,
    );
    if (!options) return null;
    this.instance = new Queue<TQueueJobTypes[QueueName.TopicsAutomation]>(
      QueueName.TopicsAutomation,
      {
        ...options,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 604800, count: 1000 },
        },
      },
    );
    this.instance.on("error", (error) =>
      logger.error("TopicsAutomationQueue error", error),
    );
    return this.instance;
  }
}
