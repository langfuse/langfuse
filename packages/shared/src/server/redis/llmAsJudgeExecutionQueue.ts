import { Queue } from "bullmq";
import { TQueueJobTypes, QueueName } from "../queues";
import { env } from "../../env";
import { logger } from "../logger";
import {
  createNewRedisInstance,
  getQueuePrefix,
  redisQueueRetryOptions,
} from "./redis";
import { getShardIndex } from "./sharding";

const llmAsJudgeExecutionQueueInstances = new Map<
  number,
  Queue<TQueueJobTypes[QueueName.LLMAsJudgeExecution]> | null
>();

const getLLMAsJudgeExecutionQueueNameForShardIndex = (shardIndex: number) =>
  `${QueueName.LLMAsJudgeExecution}${shardIndex > 0 ? `-${shardIndex}` : ""}`;

const getLLMAsJudgeExecutionShardNames = () =>
  Array.from(
    { length: env.LANGFUSE_LLM_AS_JUDGE_EXECUTION_QUEUE_SHARD_COUNT },
    (_, shardIndex) => getLLMAsJudgeExecutionQueueNameForShardIndex(shardIndex),
  );

const getLLMAsJudgeExecutionShardIndexFromShardName = (
  shardName: string | undefined,
): number | null => {
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
};

const getLLMAsJudgeExecutionQueueInstance = ({
  shardingKey,
  shardName,
}: {
  shardingKey?: string;
  shardName?: string;
} = {}): Queue<TQueueJobTypes[QueueName.LLMAsJudgeExecution]> | null => {
  const shardIndex =
    getLLMAsJudgeExecutionShardIndexFromShardName(shardName) ??
    (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
      ? getShardIndex(
          shardingKey,
          env.LANGFUSE_LLM_AS_JUDGE_EXECUTION_QUEUE_SHARD_COUNT,
        )
      : 0);

  if (llmAsJudgeExecutionQueueInstances.has(shardIndex)) {
    return llmAsJudgeExecutionQueueInstances.get(shardIndex) || null;
  }

  const newRedis = createNewRedisInstance({
    enableOfflineQueue: false,
    ...redisQueueRetryOptions,
  });

  const queueName = getLLMAsJudgeExecutionQueueNameForShardIndex(shardIndex);
  const queueInstance = newRedis
    ? new Queue<TQueueJobTypes[QueueName.LLMAsJudgeExecution]>(queueName, {
        connection: newRedis,
        prefix: getQueuePrefix(queueName),
        defaultJobOptions: {
          removeOnComplete: 10_000,
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

  llmAsJudgeExecutionQueueInstances.set(shardIndex, queueInstance);

  return queueInstance;
};

export class LLMAsJudgeExecutionQueue {
  static getShardingKey(params: {
    projectId: string;
    jobExecutionId: string;
  }): string {
    return `${params.projectId}-${params.jobExecutionId}`;
  }

  public static getShardNames() {
    return getLLMAsJudgeExecutionShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return getLLMAsJudgeExecutionShardIndexFromShardName(shardName);
  }

  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.LLMAsJudgeExecution]> | null {
    return getLLMAsJudgeExecutionQueueInstance({ shardingKey, shardName });
  }
}
