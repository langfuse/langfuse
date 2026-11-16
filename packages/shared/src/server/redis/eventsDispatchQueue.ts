import { Queue } from "bullmq";
import { env } from "../../env";
import { QueueName, type TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class EventsDispatchQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.EventsDispatch]
  > | null = null;

  public static getInstance() {
    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) return null;
    if (this.instance) return this.instance;
    const options = createBullMQQueueOptionsWithRedis(QueueName.EventsDispatch);
    if (!options) return null;

    this.instance = new Queue<TQueueJobTypes[QueueName.EventsDispatch]>(
      QueueName.EventsDispatch,
      {
        ...options,
        defaultJobOptions: {
          // Retain recent job IDs so a dispatcher retry can reuse its delivery.
          removeOnComplete: { age: 3600, count: 10000 },
          removeOnFail: 1000,
          // Per-trace failures return to Redis; a failed job retries once, an hour later.
          attempts: 2,
          backoff: { type: "fixed", delay: 60 * 60_000 },
        },
      },
    );
    this.instance.on("error", (error) => {
      logger.error("EventsDispatchQueue error", error);
    });
    return this.instance;
  }
}
