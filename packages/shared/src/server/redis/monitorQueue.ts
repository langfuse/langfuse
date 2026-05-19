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

export class MonitorQueue {
  private static instances: Map<
    number,
    Queue<TQueueJobTypes[QueueName.MonitorQueue]> | null
  > = new Map();

  public static getShardNames() {
    return Array.from(
      { length: env.LANGFUSE_MONITOR_QUEUE_SHARD_COUNT },
      (_, i) => `${QueueName.MonitorQueue}${i > 0 ? `-${i}` : ""}`,
    );
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    if (!shardName) return null;

    const shardIndex =
      shardName === QueueName.MonitorQueue
        ? 0
        : parseInt(shardName.replace(`${QueueName.MonitorQueue}-`, ""), 10);

    if (isNaN(shardIndex)) return null;
    return shardIndex;
  }

  /**
   * Get the monitor queue instance for the given sharding key or shard name.
   * @param shardingKey - Hashed and randomly allocated to a shard. Should be
   *   `${projectId}-${schedulerBatchId}` so all events for a given batch land
   *   on the same shard.
   * @param shardName - Name of the shard (e.g. `monitor-queue-2`).
   */
  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.MonitorQueue]> | null {
    const shardIndex =
      MonitorQueue.getShardIndexFromShardName(shardName) ??
      (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
        ? getShardIndex(shardingKey, env.LANGFUSE_MONITOR_QUEUE_SHARD_COUNT)
        : 0);

    if (MonitorQueue.instances.has(shardIndex)) {
      return MonitorQueue.instances.get(shardIndex) || null;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    const name = `${QueueName.MonitorQueue}${shardIndex > 0 ? `-${shardIndex}` : ""}`;
    const queueInstance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.MonitorQueue]>(name, {
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
      logger.error(`MonitorQueue shard ${shardIndex} error`, err);
    });

    MonitorQueue.instances.set(shardIndex, queueInstance);

    return queueInstance;
  }
}
