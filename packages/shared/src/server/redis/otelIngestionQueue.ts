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
import { randomUUID } from "crypto";

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
   * Get the otel ingestion queue instance for the given shard name. If not provided, uses a random shard.
   * @param shardName - Name of the shard. Should be `otel-ingestion-queue-${shardIndex}` or plainly `otel-ingestion-queue` for the first shard.
   */
  public static getInstance({
    shardName,
  }: {
    shardName?: string;
  }): Queue<TQueueJobTypes[QueueName.OtelIngestionQueue]> | null {
    const shardIndex =
      OtelIngestionQueue.getShardIndexFromShardName(shardName) ??
      (env.REDIS_CLUSTER_ENABLED === "true"
        ? getShardIndex(
            randomUUID(),
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
