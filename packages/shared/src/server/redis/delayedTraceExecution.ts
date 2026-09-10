import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class DelayedTraceExecutionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.DelayedTraceExecution]
  > | null = null;

  public static getInstance() {
    if (this.instance) return this.instance;
    const options = createBullMQQueueOptionsWithRedis(
      QueueName.DelayedTraceExecution,
    );
    if (!options) return null;
    this.instance = new Queue<TQueueJobTypes[QueueName.DelayedTraceExecution]>(
      QueueName.DelayedTraceExecution,
      {
        ...options,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: 1000,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        },
      },
    );
    this.instance.on("error", (error) => {
      logger.error("DelayedTraceExecutionQueue error", error);
    });
    return this.instance;
  }
}
