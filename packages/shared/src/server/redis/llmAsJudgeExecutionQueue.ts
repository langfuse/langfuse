import { Queue } from "bullmq";
import { logger } from "../logger";
import { TQueueJobTypes, QueueName } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";

export class LLMAsJudgeExecutionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.LLMAsJudgeExecution]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.LLMAsJudgeExecution]
  > | null {
    if (LLMAsJudgeExecutionQueue.instance)
      return LLMAsJudgeExecutionQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    LLMAsJudgeExecutionQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.LLMAsJudgeExecution]>(
          QueueName.LLMAsJudgeExecution,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.LLMAsJudgeExecution),
            defaultJobOptions: {
              removeOnComplete: 10_000, // important for job deduplication
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

    LLMAsJudgeExecutionQueue.instance?.on("error", (err) => {
      logger.error("LLMAsJudgeExecutionQueue error", err);
    });

    return LLMAsJudgeExecutionQueue.instance;
  }
}
