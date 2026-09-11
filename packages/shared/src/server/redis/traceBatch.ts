import { Queue } from "bullmq";
import { QueueName, type TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class TraceBatchQueue {
  private static instance: Queue<TQueueJobTypes[QueueName.TraceBatch]> | null =
    null;

  public static getInstance() {
    if (this.instance) return this.instance;
    const options = createBullMQQueueOptionsWithRedis(QueueName.TraceBatch);
    if (!options) return null;

    this.instance = new Queue<TQueueJobTypes[QueueName.TraceBatch]>(
      QueueName.TraceBatch,
      {
        ...options,
        defaultJobOptions: {
          // Retain recent job IDs so a dispatcher retry can reuse its delivery.
          removeOnComplete: { age: 3600, count: 10000 },
          removeOnFail: 1000,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        },
      },
    );
    this.instance.on("error", (error) => {
      logger.error("TraceBatchQueue error", error);
    });
    return this.instance;
  }
}
