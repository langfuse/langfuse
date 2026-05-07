import { Queue } from "bullmq";
import { logger } from "../logger";
import { TQueueJobTypes, QueueName } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { getShardIndex } from "./sharding";
import { env } from "../../env";

export class LLMAsJudgeExecutionQueue {
  private static instances: Map<
    number,
    Queue<TQueueJobTypes[QueueName.LLMAsJudgeExecution]> | null
  > = new Map();

  public static getShardNames() {
    return Array.from(
      { length: env.LANGFUSE_LLM_AS_JUDGE_EXECUTION_QUEUE_SHARD_COUNT },
      (_, i) => `${QueueName.LLMAsJudgeExecution}${i > 0 ? `-${i}` : ""}`,
    );
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    if (!shardName) return null;

    const shardIndex =
      shardName === QueueName.LLMAsJudgeExecution
        ? 0
        : parseInt(
            shardName.replace(`${QueueName.LLMAsJudgeExecution}-`, ""),
            10,
          );

    if (isNaN(shardIndex)) return null;
    return shardIndex;
  }

  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.LLMAsJudgeExecution]> | null {
    const shardIndex =
      LLMAsJudgeExecutionQueue.getShardIndexFromShardName(shardName) ??
      (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
        ? getShardIndex(
            shardingKey,
            env.LANGFUSE_LLM_AS_JUDGE_EXECUTION_QUEUE_SHARD_COUNT,
          )
        : 0);

    if (LLMAsJudgeExecutionQueue.instances.has(shardIndex)) {
      return LLMAsJudgeExecutionQueue.instances.get(shardIndex) || null;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    const name = `${QueueName.LLMAsJudgeExecution}${shardIndex > 0 ? `-${shardIndex}` : ""}`;
    const queueInstance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.LLMAsJudgeExecution]>(name, {
          connection: newRedis,
          prefix: getQueuePrefix(name),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 10_000,
            attempts: 10,
            backoff: {
              type: "exponential",
              delay: 1000,
            },
          },
        })
      : null;

    queueInstance?.on("error", (err) => {
      logger.error(`LLMAsJudgeExecutionQueue shard ${shardIndex} error`, err);
    });

    LLMAsJudgeExecutionQueue.instances.set(shardIndex, queueInstance);

    return queueInstance;
  }
}
