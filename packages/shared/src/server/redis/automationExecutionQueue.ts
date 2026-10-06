import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { logger } from "../logger";
import { createBullMQQueueOptionsWithRedis } from "./redis";

export class AutomationExecutionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.AutomationExecutionQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.AutomationExecutionQueue]
  > | null {
    if (AutomationExecutionQueue.instance) {
      return AutomationExecutionQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.AutomationExecutionQueue,
    );
    AutomationExecutionQueue.instance = queueOptionsWithRedis
      ? new Queue<TQueueJobTypes[QueueName.AutomationExecutionQueue]>(
          QueueName.AutomationExecutionQueue,
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

    AutomationExecutionQueue.instance?.on("error", (error) => {
      logger.error("AutomationExecutionQueue error", error);
    });

    return AutomationExecutionQueue.instance;
  }
}
