import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { env } from "../../env";
import { logger } from "../logger";
import {
  createNewRedisInstance,
  getQueuePrefix,
  redisQueueRetryOptions,
} from "./redis";
import { getShardIndex } from "./sharding";

const otelIngestionQueueInstances = new Map<
  number,
  Queue<TQueueJobTypes[QueueName.OtelIngestionQueue]> | null
>();

const getOtelIngestionQueueNameForShardIndex = (shardIndex: number) =>
  `${QueueName.OtelIngestionQueue}${shardIndex > 0 ? `-${shardIndex}` : ""}`;

const getOtelIngestionShardNames = () =>
  Array.from(
    { length: env.LANGFUSE_OTEL_INGESTION_QUEUE_SHARD_COUNT },
    (_, shardIndex) => getOtelIngestionQueueNameForShardIndex(shardIndex),
  );

const getOtelIngestionShardIndexFromShardName = (
  shardName: string | undefined,
): number | null => {
  if (!shardName) return null;

  const shardIndex =
    shardName === QueueName.OtelIngestionQueue
      ? 0
      : parseInt(shardName.replace(`${QueueName.OtelIngestionQueue}-`, ""), 10);

  if (isNaN(shardIndex)) return null;
  return shardIndex;
};

const getOtelIngestionQueueInstance = ({
  shardingKey,
  shardName,
}: {
  shardingKey?: string;
  shardName?: string;
} = {}): Queue<TQueueJobTypes[QueueName.OtelIngestionQueue]> | null => {
  const shardIndex =
    getOtelIngestionShardIndexFromShardName(shardName) ??
    (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
      ? getShardIndex(
          shardingKey,
          env.LANGFUSE_OTEL_INGESTION_QUEUE_SHARD_COUNT,
        )
      : 0);

  if (otelIngestionQueueInstances.has(shardIndex)) {
    return otelIngestionQueueInstances.get(shardIndex) || null;
  }

  const newRedis = createNewRedisInstance({
    enableOfflineQueue: false,
    ...redisQueueRetryOptions,
  });

  const queueName = getOtelIngestionQueueNameForShardIndex(shardIndex);
  const queueInstance = newRedis
    ? new Queue<TQueueJobTypes[QueueName.OtelIngestionQueue]>(queueName, {
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
    logger.error(`OtelIngestionQueue shard ${shardIndex} error`, err);
  });

  otelIngestionQueueInstances.set(shardIndex, queueInstance);

  return queueInstance;
};

export class OtelIngestionQueue {
  static getShardingKey(params: {
    projectId: string;
    fileKey: string;
  }): string {
    return `${params.projectId}-${params.fileKey}`;
  }

  public static getShardNames() {
    return getOtelIngestionShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return getOtelIngestionShardIndexFromShardName(shardName);
  }

  /**
   * Get the otel ingestion queue instance for the given sharding key or shard name.
   * @param shardName - Name of the shard. Should be `otel-ingestion-queue-${shardIndex}` or plainly `otel-ingestion-queue` for the first shard.
   */
  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.OtelIngestionQueue]> | null {
    return getOtelIngestionQueueInstance({ shardingKey, shardName });
  }
}
