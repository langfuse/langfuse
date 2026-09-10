import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class TraceObservationReadQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.TraceObservationRead]
  > | null = null;

  public static getInstance() {
    if (this.instance) return this.instance;
    const options = createBullMQQueueOptionsWithRedis(
      QueueName.TraceObservationRead,
    );
    if (!options) return null;
    this.instance = new Queue<TQueueJobTypes[QueueName.TraceObservationRead]>(
      QueueName.TraceObservationRead,
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
      logger.error("TraceObservationReadQueue error", error);
    });
    return this.instance;
  }
}
