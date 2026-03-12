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

const evalExecutionQueueInstances = new Map<
  number,
  Queue<TQueueJobTypes[QueueName.EvaluationExecution]> | null
>();

const getEvalExecutionQueueNameForShardIndex = (shardIndex: number) =>
  `${QueueName.EvaluationExecution}${shardIndex > 0 ? `-${shardIndex}` : ""}`;

const getEvalExecutionShardNames = () =>
  Array.from(
    { length: env.LANGFUSE_EVAL_EXECUTION_QUEUE_SHARD_COUNT },
    (_, shardIndex) => getEvalExecutionQueueNameForShardIndex(shardIndex),
  );

const getEvalExecutionShardIndexFromShardName = (
  shardName: string | undefined,
): number | null => {
  if (!shardName) return null;

  const shardIndex =
    shardName === QueueName.EvaluationExecution
      ? 0
      : parseInt(
          shardName.replace(`${QueueName.EvaluationExecution}-`, ""),
          10,
        );

  if (isNaN(shardIndex)) return null;
  return shardIndex;
};

const getEvalExecutionQueueInstance = ({
  shardingKey,
  shardName,
}: {
  shardingKey?: string;
  shardName?: string;
} = {}): Queue<TQueueJobTypes[QueueName.EvaluationExecution]> | null => {
  const shardIndex =
    getEvalExecutionShardIndexFromShardName(shardName) ??
    (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
      ? getShardIndex(
          shardingKey,
          env.LANGFUSE_EVAL_EXECUTION_QUEUE_SHARD_COUNT,
        )
      : 0);

  if (evalExecutionQueueInstances.has(shardIndex)) {
    return evalExecutionQueueInstances.get(shardIndex) || null;
  }

  const newRedis = createNewRedisInstance({
    enableOfflineQueue: false,
    ...redisQueueRetryOptions,
  });

  const queueName = getEvalExecutionQueueNameForShardIndex(shardIndex);
  const queueInstance = newRedis
    ? new Queue<TQueueJobTypes[QueueName.EvaluationExecution]>(queueName, {
        connection: newRedis,
        prefix: getQueuePrefix(queueName),
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
    logger.error(`EvalExecutionQueue shard ${shardIndex} error`, err);
  });

  evalExecutionQueueInstances.set(shardIndex, queueInstance);

  return queueInstance;
};

const secondaryEvalExecutionQueueInstances = new Map<
  number,
  Queue<TQueueJobTypes[QueueName.EvaluationExecutionSecondaryQueue]> | null
>();

const getSecondaryEvalExecutionQueueNameForShardIndex = (shardIndex: number) =>
  `${QueueName.EvaluationExecutionSecondaryQueue}${shardIndex > 0 ? `-${shardIndex}` : ""}`;

const getSecondaryEvalExecutionShardNames = () =>
  Array.from(
    { length: env.LANGFUSE_EVAL_EXECUTION_SECONDARY_QUEUE_SHARD_COUNT },
    (_, shardIndex) =>
      getSecondaryEvalExecutionQueueNameForShardIndex(shardIndex),
  );

const getSecondaryEvalExecutionShardIndexFromShardName = (
  shardName: string | undefined,
): number | null => {
  if (!shardName) return null;

  const shardIndex =
    shardName === QueueName.EvaluationExecutionSecondaryQueue
      ? 0
      : parseInt(
          shardName.replace(
            `${QueueName.EvaluationExecutionSecondaryQueue}-`,
            "",
          ),
          10,
        );

  if (isNaN(shardIndex)) return null;
  return shardIndex;
};

const getSecondaryEvalExecutionQueueInstance = ({
  shardingKey,
  shardName,
}: {
  shardingKey?: string;
  shardName?: string;
} = {}): Queue<
  TQueueJobTypes[QueueName.EvaluationExecutionSecondaryQueue]
> | null => {
  const shardIndex =
    getSecondaryEvalExecutionShardIndexFromShardName(shardName) ??
    (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
      ? getShardIndex(
          shardingKey,
          env.LANGFUSE_EVAL_EXECUTION_SECONDARY_QUEUE_SHARD_COUNT,
        )
      : 0);

  if (secondaryEvalExecutionQueueInstances.has(shardIndex)) {
    return secondaryEvalExecutionQueueInstances.get(shardIndex) || null;
  }

  const newRedis = createNewRedisInstance({
    enableOfflineQueue: false,
    ...redisQueueRetryOptions,
  });

  const queueName = getSecondaryEvalExecutionQueueNameForShardIndex(shardIndex);
  const queueInstance = newRedis
    ? new Queue<TQueueJobTypes[QueueName.EvaluationExecutionSecondaryQueue]>(
        queueName,
        {
          connection: newRedis,
          prefix: getQueuePrefix(queueName),
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

  queueInstance?.on("error", (err) => {
    logger.error(`SecondaryEvalExecutionQueue shard ${shardIndex} error`, err);
  });

  secondaryEvalExecutionQueueInstances.set(shardIndex, queueInstance);

  return queueInstance;
};

export class EvalExecutionQueue {
  static getShardingKey(params: {
    projectId: string;
    jobExecutionId: string;
  }): string {
    return `${params.projectId}-${params.jobExecutionId}`;
  }

  public static getShardNames() {
    return getEvalExecutionShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return getEvalExecutionShardIndexFromShardName(shardName);
  }

  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.EvaluationExecution]> | null {
    return getEvalExecutionQueueInstance({ shardingKey, shardName });
  }
}

export class SecondaryEvalExecutionQueue {
  static getShardingKey(params: {
    projectId: string;
    jobExecutionId: string;
  }): string {
    return EvalExecutionQueue.getShardingKey(params);
  }

  public static getShardNames() {
    return getSecondaryEvalExecutionShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return getSecondaryEvalExecutionShardIndexFromShardName(shardName);
  }

  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<
    TQueueJobTypes[QueueName.EvaluationExecutionSecondaryQueue]
  > | null {
    return getSecondaryEvalExecutionQueueInstance({ shardingKey, shardName });
  }
}
