import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class TraceExecutionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.TraceExecution]
  > | null = null;

  public static getInstance() {
    if (this.instance) return this.instance;
    const options = createBullMQQueueOptionsWithRedis(QueueName.TraceExecution);
    if (!options) return null;
    this.instance = new Queue<TQueueJobTypes[QueueName.TraceExecution]>(
      QueueName.TraceExecution,
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
      logger.error("TraceExecutionQueue error", error);
    });
    return this.instance;
  }
}
