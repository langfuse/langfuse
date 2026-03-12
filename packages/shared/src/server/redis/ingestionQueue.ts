import { Queue } from "bullmq";
import { QueueName, type TQueueJobTypes } from "../queues";
import { env } from "../../env";
import { logger } from "../logger";
import {
  createNewRedisInstance,
  getQueuePrefix,
  redisQueueRetryOptions,
} from "./redis";
import { getShardIndex } from "./sharding";

const ingestionQueueInstances = new Map<
  number,
  Queue<TQueueJobTypes[QueueName.IngestionQueue]> | null
>();

const getIngestionQueueNameForShardIndex = (shardIndex: number) =>
  `${QueueName.IngestionQueue}${shardIndex > 0 ? `-${shardIndex}` : ""}`;

const getIngestionShardNames = () =>
  Array.from(
    { length: env.LANGFUSE_INGESTION_QUEUE_SHARD_COUNT },
    (_, shardIndex) => getIngestionQueueNameForShardIndex(shardIndex),
  );

const getIngestionShardIndexFromShardName = (
  shardName: string | undefined,
): number | null => {
  if (!shardName) return null;

  const shardIndex =
    shardName === QueueName.IngestionQueue
      ? 0
      : parseInt(shardName.replace(`${QueueName.IngestionQueue}-`, ""), 10);

  if (isNaN(shardIndex)) return null;
  return shardIndex;
};

const getIngestionQueueInstance = ({
  shardingKey,
  shardName,
}: {
  shardingKey?: string;
  shardName?: string;
} = {}): Queue<TQueueJobTypes[QueueName.IngestionQueue]> | null => {
  const shardIndex =
    getIngestionShardIndexFromShardName(shardName) ??
    (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
      ? getShardIndex(shardingKey, env.LANGFUSE_INGESTION_QUEUE_SHARD_COUNT)
      : 0);

  if (ingestionQueueInstances.has(shardIndex)) {
    return ingestionQueueInstances.get(shardIndex) || null;
  }

  const newRedis = createNewRedisInstance({
    enableOfflineQueue: false,
    ...redisQueueRetryOptions,
  });

  const queueName = getIngestionQueueNameForShardIndex(shardIndex);
  const queueInstance = newRedis
    ? new Queue<TQueueJobTypes[QueueName.IngestionQueue]>(queueName, {
        connection: newRedis,
        prefix: getQueuePrefix(queueName),
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
    logger.error(`IngestionQueue shard ${shardIndex} error`, err);
  });

  ingestionQueueInstances.set(shardIndex, queueInstance);

  return queueInstance;
};

const secondaryIngestionQueueInstances = new Map<
  number,
  Queue<TQueueJobTypes[QueueName.IngestionSecondaryQueue]> | null
>();

const getSecondaryIngestionQueueNameForShardIndex = (shardIndex: number) =>
  `${QueueName.IngestionSecondaryQueue}${shardIndex > 0 ? `-${shardIndex}` : ""}`;

const getSecondaryIngestionShardNames = () =>
  Array.from(
    { length: env.LANGFUSE_INGESTION_SECONDARY_QUEUE_SHARD_COUNT },
    (_, shardIndex) => getSecondaryIngestionQueueNameForShardIndex(shardIndex),
  );

const getSecondaryIngestionShardIndexFromShardName = (
  shardName: string | undefined,
): number | null => {
  if (!shardName) return null;

  const shardIndex =
    shardName === QueueName.IngestionSecondaryQueue
      ? 0
      : parseInt(
          shardName.replace(`${QueueName.IngestionSecondaryQueue}-`, ""),
          10,
        );

  if (isNaN(shardIndex)) return null;
  return shardIndex;
};

const getSecondaryIngestionQueueInstance = ({
  shardingKey,
  shardName,
}: {
  shardingKey?: string;
  shardName?: string;
} = {}): Queue<TQueueJobTypes[QueueName.IngestionSecondaryQueue]> | null => {
  const shardIndex =
    getSecondaryIngestionShardIndexFromShardName(shardName) ??
    (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
      ? getShardIndex(
          shardingKey,
          env.LANGFUSE_INGESTION_SECONDARY_QUEUE_SHARD_COUNT,
        )
      : 0);

  if (secondaryIngestionQueueInstances.has(shardIndex)) {
    return secondaryIngestionQueueInstances.get(shardIndex) || null;
  }

  const newRedis = createNewRedisInstance({
    enableOfflineQueue: false,
    ...redisQueueRetryOptions,
  });

  const queueName = getSecondaryIngestionQueueNameForShardIndex(shardIndex);
  const queueInstance = newRedis
    ? new Queue<TQueueJobTypes[QueueName.IngestionSecondaryQueue]>(queueName, {
        connection: newRedis,
        prefix: getQueuePrefix(queueName),
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
    logger.error(`SecondaryIngestionQueue shard ${shardIndex} error`, err);
  });

  secondaryIngestionQueueInstances.set(shardIndex, queueInstance);

  return queueInstance;
};

export class IngestionQueue {
  static getShardingKey(params: {
    projectId: string;
    eventBodyId: string;
  }): string {
    return `${params.projectId}-${params.eventBodyId}`;
  }

  public static getShardNames() {
    return getIngestionShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return getIngestionShardIndexFromShardName(shardName);
  }

  /**
   * Get the ingestion queue instance for the given sharding key or shard name.
   * @param shardingKey - Sharding key hashed to a deterministic shard. Should be `projectId-eventBodyId`.
   * @param shardName - Name of the shard. Should be `ingestion-queue-${shardIndex}` or plainly `ingestion-queue` for the first shard.
   */
  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.IngestionQueue]> | null {
    return getIngestionQueueInstance({ shardingKey, shardName });
  }
}

export class SecondaryIngestionQueue {
  static getShardingKey(params: {
    projectId: string;
    eventBodyId: string;
  }): string {
    return IngestionQueue.getShardingKey(params);
  }

  public static getShardNames() {
    return getSecondaryIngestionShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return getSecondaryIngestionShardIndexFromShardName(shardName);
  }

  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.IngestionSecondaryQueue]> | null {
    return getSecondaryIngestionQueueInstance({ shardingKey, shardName });
  }
}
