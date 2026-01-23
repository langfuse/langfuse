import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";
import { getShardIndex } from "./sharding";
import { env } from "../../env";

export class TraceUpsertQueue {
  private static instances: Map<
    number,
    Queue<TQueueJobTypes[QueueName.TraceUpsert]> | null
  > = new Map();

  public static getShardNames() {
    return Array.from(
      { length: env.LANGFUSE_TRACE_UPSERT_QUEUE_SHARD_COUNT },
      (_, i) => `${QueueName.TraceUpsert}${i > 0 ? `-${i}` : ""}`,
    );
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    if (!shardName) return null;

    // Extract shard index from shard name
    const shardIndex =
      shardName === QueueName.TraceUpsert
        ? 0
        : parseInt(shardName.replace(`${QueueName.TraceUpsert}-`, ""), 10);

    if (isNaN(shardIndex)) return null;
    return shardIndex;
  }

  /**
   * Get the trace upsert queue instance for the given sharding key or shard name.
   * @param shardingKey - ShardingKey is being hashed and randomly allocated to a shard. Should be `projectId-traceId`.
   * @param shardName - Name of the shard. Should be `trace-upsert-queue-${shardIndex}` or plainly `trace-upsert-queue` for the first shard.
   */
  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.TraceUpsert]> | null {
    const shardIndex =
      TraceUpsertQueue.getShardIndexFromShardName(shardName) ??
      (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
        ? getShardIndex(
            shardingKey,
            env.LANGFUSE_TRACE_UPSERT_QUEUE_SHARD_COUNT,
          )
        : 0);

    // Check if we already have an instance for this shard
    if (TraceUpsertQueue.instances.has(shardIndex)) {
      return TraceUpsertQueue.instances.get(shardIndex) || null;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    const name = `${QueueName.TraceUpsert}${shardIndex > 0 ? `-${shardIndex}` : ""}`;
    const queueInstance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.TraceUpsert]>(name, {
          connection: newRedis,
          prefix: getQueuePrefix(name),
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 100_000,
            attempts: env.LANGFUSE_TRACE_UPSERT_QUEUE_ATTEMPTS,
            delay: 30_000, // 30 seconds
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    queueInstance?.on("error", (err) => {
      logger.error(`TraceUpsertQueue shard ${shardIndex} error`, err);
    });

    TraceUpsertQueue.instances.set(shardIndex, queueInstance);

    return queueInstance;
  }
}
