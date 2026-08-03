import { Queue } from "bullmq";
import { QueueName } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

export class ClickhouseWriterDeadLetterQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (ClickhouseWriterDeadLetterQueue.instance) {
      return ClickhouseWriterDeadLetterQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.ClickhouseWriterDeadLetterQueue,
    );
    ClickhouseWriterDeadLetterQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.ClickhouseWriterDeadLetterQueue, {
          ...queueOptionsWithRedis,
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 10_000,
            attempts: 5,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    ClickhouseWriterDeadLetterQueue.instance?.on("error", (error) => {
      logger.error("ClickhouseWriterDeadLetterQueue error", error);
    });

    return ClickhouseWriterDeadLetterQueue.instance;
  }
}
