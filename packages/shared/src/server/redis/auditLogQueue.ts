import { Queue } from "bullmq";
import { logger } from "../logger";
import { TQueueJobTypes, QueueName } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";

/**
 * Carries one audit log row per job from web to the worker, which batches the
 * rows into ClickHouse. Retries are safe: the destination table collapses
 * duplicate rows by id.
 */
export class AuditLogQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.AuditLogQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.AuditLogQueue]
  > | null {
    if (AuditLogQueue.instance) return AuditLogQueue.instance;

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.AuditLogQueue,
    );
    AuditLogQueue.instance = queueOptionsWithRedis
      ? new Queue<TQueueJobTypes[QueueName.AuditLogQueue]>(
          QueueName.AuditLogQueue,
          {
            ...queueOptionsWithRedis,
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 10_000,
              attempts: 5,
              backoff: {
                type: "exponential",
                delay: 5_000,
              },
            },
          },
        )
      : null;

    AuditLogQueue.instance?.on("error", (err) => {
      logger.error("AuditLogQueue error", err);
    });

    return AuditLogQueue.instance;
  }
}
