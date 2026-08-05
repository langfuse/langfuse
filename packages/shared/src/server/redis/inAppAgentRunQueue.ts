import { Queue } from "bullmq";
import { QueueName, type TQueueJobTypes } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class InAppAgentRunQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.InAppAgentRunQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.InAppAgentRunQueue]
  > | null {
    if (InAppAgentRunQueue.instance) return InAppAgentRunQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    InAppAgentRunQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.InAppAgentRunQueue]>(
          QueueName.InAppAgentRunQueue,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.InAppAgentRunQueue),
            defaultJobOptions: {
              removeOnComplete: true,
              // Terminal jobs must not linger: `add` against a retained jobId
              // is a silent no-op, so a failed job would poison the
              // deterministic `jobId = runId` and block the lifecycle sweep
              // from ever redispatching that run. Postgres already keeps the
              // failure on the run row (errorCode/errorMessage).
              removeOnFail: true,
              // Postgres owns correctness (claim CAS + reconcile-on-read);
              // BullMQ is delivery-only, so never redeliver on its own.
              attempts: 1,
            },
          },
        )
      : null;

    InAppAgentRunQueue.instance?.on("error", (err) => {
      logger.error("InAppAgentRunQueue error", err);
    });

    return InAppAgentRunQueue.instance;
  }
}
