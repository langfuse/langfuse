import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class EntityChangeQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.EntityChangeQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.EntityChangeQueue]
  > | null {
    if (EntityChangeQueue.instance) return EntityChangeQueue.instance;

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.EntityChangeQueue,
    );
    EntityChangeQueue.instance = queueOptionsWithRedis
      ? new Queue<TQueueJobTypes[QueueName.EntityChangeQueue]>(
          QueueName.EntityChangeQueue,
          {
            ...queueOptionsWithRedis,
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 100_000,
              attempts: 5,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    EntityChangeQueue.instance?.on("error", (err) => {
      logger.error("EntityChangeQueue error", err);
    });

    return EntityChangeQueue.instance;
  }
}
