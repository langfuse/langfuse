import { Queue } from "bullmq";
import {
  createNewRedisInstance,
  QueueName,
  TQueueJobTypes,
  logger,
  redisQueueRetryOptions,
} from "@langfuse/shared/src/server";

export class EvalExecutionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.EvaluationExecution]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.EvaluationExecution]
  > | null {
    if (EvalExecutionQueue.instance) return EvalExecutionQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    EvalExecutionQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.EvaluationExecution]>(
          QueueName.EvaluationExecution,
          {
            connection: newRedis,
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 10_000,
              attempts: 2,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    EvalExecutionQueue.instance?.on("error", (err) => {
      logger.error("EvalExecutionQueue error", err);
    });

    return EvalExecutionQueue.instance;
  }
}
