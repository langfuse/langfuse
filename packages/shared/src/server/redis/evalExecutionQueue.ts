import { Queue } from "bullmq";
import { logger } from "../logger";
import { TQueueJobTypes, QueueName } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";

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
            prefix: getQueuePrefix(QueueName.EvaluationExecution),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 10_000,
              attempts: 10,
              backoff: {
                type: "exponential",
                delay: 1000,
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
