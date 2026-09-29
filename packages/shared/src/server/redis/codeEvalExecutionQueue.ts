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

export class CodeEvalExecutionQueue {
  private static instances: Map<
    number,
    Queue<TQueueJobTypes[QueueName.CodeEvalExecution]> | null
  > = new Map();

  public static getShardNames() {
    return Array.from(
      { length: env.LANGFUSE_CODE_EVAL_EXECUTION_QUEUE_SHARD_COUNT },
      (_, i) => `${QueueName.CodeEvalExecution}${i > 0 ? `-${i}` : ""}`,
    );
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    if (!shardName) return null;

    const shardIndex =
      shardName === QueueName.CodeEvalExecution
        ? 0
        : parseInt(
            shardName.replace(`${QueueName.CodeEvalExecution}-`, ""),
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
  } = {}): Queue<TQueueJobTypes[QueueName.CodeEvalExecution]> | null {
    const shardIndex =
      CodeEvalExecutionQueue.getShardIndexFromShardName(shardName) ??
      (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
        ? getShardIndex(
            shardingKey,
            env.LANGFUSE_CODE_EVAL_EXECUTION_QUEUE_SHARD_COUNT,
          )
        : 0);

    if (CodeEvalExecutionQueue.instances.has(shardIndex)) {
      return CodeEvalExecutionQueue.instances.get(shardIndex) || null;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    const name = `${QueueName.CodeEvalExecution}${shardIndex > 0 ? `-${shardIndex}` : ""}`;
    const queueInstance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.CodeEvalExecution]>(name, {
          connection: newRedis,
          prefix: getQueuePrefix(name),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 10_000,
            attempts: 3,
            backoff: {
              type: "exponential",
              // Spaced for transient Lambda failures (e.g. regional capacity):
              // retries fire ~30s and ~60s after the failed attempt.
              delay: 30_000,
            },
          },
        })
      : null;

    queueInstance?.on("error", (err) => {
      logger.error(`CodeEvalExecutionQueue shard ${shardIndex} error`, err);
    });

    CodeEvalExecutionQueue.instances.set(shardIndex, queueInstance);

    return queueInstance;
  }
}
