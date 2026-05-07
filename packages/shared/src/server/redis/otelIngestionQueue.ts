import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";
import { getShardIndex } from "./sharding";
import { env } from "../../env";
export class OtelIngestionQueue {
  private static instances: Map<
    number,
    Queue<TQueueJobTypes[QueueName.OtelIngestionQueue]> | null
  > = new Map();

  public static getShardNames() {
    return Array.from(
      { length: env.LANGFUSE_OTEL_INGESTION_QUEUE_SHARD_COUNT },
      (_, i) => `${QueueName.OtelIngestionQueue}${i > 0 ? `-${i}` : ""}`,
    );
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    if (!shardName) return null;

    // Extract shard index from shard name
    const shardIndex =
      shardName === QueueName.OtelIngestionQueue
        ? 0
        : parseInt(
            shardName.replace(`${QueueName.OtelIngestionQueue}-`, ""),
            10,
          );

    if (isNaN(shardIndex)) return null;
    return shardIndex;
  }

  /**
   * Get the otel ingestion queue instance for the given sharding key or shard name.
   * @param shardingKey - ShardingKey is being hashed and randomly allocated to a shard. Should be `projectId-fileKey`.
   * @param shardName - Name of the shard. Should be `otel-ingestion-queue-${shardIndex}` or plainly `otel-ingestion-queue` for the first shard.
   */
  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.OtelIngestionQueue]> | null {
    const shardIndex =
      OtelIngestionQueue.getShardIndexFromShardName(shardName) ??
      (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
        ? getShardIndex(
            shardingKey,
            env.LANGFUSE_OTEL_INGESTION_QUEUE_SHARD_COUNT,
          )
        : 0);

    // Check if we already have an instance for this shard
    if (OtelIngestionQueue.instances.has(shardIndex)) {
      return OtelIngestionQueue.instances.get(shardIndex) || null;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    const name = `${QueueName.OtelIngestionQueue}${shardIndex > 0 ? `-${shardIndex}` : ""}`;
    const queueInstance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.OtelIngestionQueue]>(name, {
          connection: newRedis,
          prefix: getQueuePrefix(name),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100_000,
            attempts: 6,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    queueInstance?.on("error", (err) => {
      logger.error(`OtelIngestionQueue shard ${shardIndex} error`, err);
    });

    OtelIngestionQueue.instances.set(shardIndex, queueInstance);

    return queueInstance;
  }
}

export class SecondaryOtelIngestionQueue {
  private static instances: Map<
    number,
    Queue<TQueueJobTypes[QueueName.OtelIngestionSecondaryQueue]> | null
  > = new Map();

  public static getShardNames() {
    return Array.from(
      { length: env.LANGFUSE_OTEL_INGESTION_SECONDARY_QUEUE_SHARD_COUNT },
      (_, i) =>
        `${QueueName.OtelIngestionSecondaryQueue}${i > 0 ? `-${i}` : ""}`,
    );
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    if (!shardName) return null;

    const shardIndex =
      shardName === QueueName.OtelIngestionSecondaryQueue
        ? 0
        : parseInt(
            shardName.replace(`${QueueName.OtelIngestionSecondaryQueue}-`, ""),
            10,
          );

    if (isNaN(shardIndex)) return null;
    return shardIndex;
  }

  /**
   * Get the secondary otel ingestion queue instance for the given sharding key or shard name.
   * @param shardingKey - ShardingKey is being hashed and randomly allocated to a shard. Should be `projectId-fileKey`.
   * @param shardName - Name of the shard. Should be `secondary-otel-ingestion-queue-${shardIndex}` or plainly `secondary-otel-ingestion-queue` for the first shard.
   */
  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.OtelIngestionSecondaryQueue]> | null {
    const shardIndex =
      SecondaryOtelIngestionQueue.getShardIndexFromShardName(shardName) ??
      (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
        ? getShardIndex(
            shardingKey,
            env.LANGFUSE_OTEL_INGESTION_SECONDARY_QUEUE_SHARD_COUNT,
          )
        : 0);

    if (SecondaryOtelIngestionQueue.instances.has(shardIndex)) {
      return SecondaryOtelIngestionQueue.instances.get(shardIndex) || null;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    const name = `${QueueName.OtelIngestionSecondaryQueue}${shardIndex > 0 ? `-${shardIndex}` : ""}`;
    const queueInstance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.OtelIngestionSecondaryQueue]>(name, {
          connection: newRedis,
          prefix: getQueuePrefix(name),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100_000,
            attempts: 5,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    queueInstance?.on("error", (err) => {
      logger.error(
        `SecondaryOtelIngestionQueue shard ${shardIndex} error`,
        err,
      );
    });

    SecondaryOtelIngestionQueue.instances.set(shardIndex, queueInstance);

    return queueInstance;
  }
}
