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

export class EvalExecutionQueue {
  private static instances: Map<
    number,
    Queue<TQueueJobTypes[QueueName.EvaluationExecution]> | null
  > = new Map();

  public static getShardNames() {
    return Array.from(
      { length: env.LANGFUSE_EVAL_EXECUTION_QUEUE_SHARD_COUNT },
      (_, i) => `${QueueName.EvaluationExecution}${i > 0 ? `-${i}` : ""}`,
    );
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
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
  }

  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.EvaluationExecution]> | null {
    const shardIndex =
      EvalExecutionQueue.getShardIndexFromShardName(shardName) ??
      (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
        ? getShardIndex(
            shardingKey,
            env.LANGFUSE_EVAL_EXECUTION_QUEUE_SHARD_COUNT,
          )
        : 0);

    if (EvalExecutionQueue.instances.has(shardIndex)) {
      return EvalExecutionQueue.instances.get(shardIndex) || null;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    const name = `${QueueName.EvaluationExecution}${shardIndex > 0 ? `-${shardIndex}` : ""}`;
    const queueInstance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.EvaluationExecution]>(name, {
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
      logger.error(`EvalExecutionQueue shard ${shardIndex} error`, err);
    });

    EvalExecutionQueue.instances.set(shardIndex, queueInstance);

    return queueInstance;
  }
}

export class SecondaryEvalExecutionQueue {
  private static instances: Map<
    number,
    Queue<TQueueJobTypes[QueueName.EvaluationExecutionSecondaryQueue]> | null
  > = new Map();

  public static getShardNames() {
    return Array.from(
      {
        length: env.LANGFUSE_EVAL_EXECUTION_SECONDARY_QUEUE_SHARD_COUNT,
      },
      (_, i) =>
        `${QueueName.EvaluationExecutionSecondaryQueue}${i > 0 ? `-${i}` : ""}`,
    );
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
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
    const shardIndex =
      SecondaryEvalExecutionQueue.getShardIndexFromShardName(shardName) ??
      (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
        ? getShardIndex(
            shardingKey,
            env.LANGFUSE_EVAL_EXECUTION_SECONDARY_QUEUE_SHARD_COUNT,
          )
        : 0);

    if (SecondaryEvalExecutionQueue.instances.has(shardIndex)) {
      return SecondaryEvalExecutionQueue.instances.get(shardIndex) || null;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    const name = `${QueueName.EvaluationExecutionSecondaryQueue}${shardIndex > 0 ? `-${shardIndex}` : ""}`;
    const queueInstance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.EvaluationExecutionSecondaryQueue]>(
          name,
          {
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
          },
        )
      : null;

    queueInstance?.on("error", (err) => {
      logger.error(
        `SecondaryEvalExecutionQueue shard ${shardIndex} error`,
        err,
      );
    });

    SecondaryEvalExecutionQueue.instances.set(shardIndex, queueInstance);

    return queueInstance;
  }
}
