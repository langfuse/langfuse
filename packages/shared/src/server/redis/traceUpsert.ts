import { QueueName, TQueueJobTypes } from "../queues";
import { Queue } from "bullmq";
import { env } from "../../env";
import { logger } from "../logger";
import {
  createNewRedisInstance,
  getQueuePrefix,
  redisQueueRetryOptions,
} from "./redis";
import { getShardIndex } from "./sharding";

const traceUpsertQueueInstances = new Map<
  number,
  Queue<TQueueJobTypes[QueueName.TraceUpsert]> | null
>();

const getTraceUpsertQueueNameForShardIndex = (shardIndex: number) =>
  `${QueueName.TraceUpsert}${shardIndex > 0 ? `-${shardIndex}` : ""}`;

const getTraceUpsertShardNames = () =>
  Array.from(
    { length: env.LANGFUSE_TRACE_UPSERT_QUEUE_SHARD_COUNT },
    (_, shardIndex) => getTraceUpsertQueueNameForShardIndex(shardIndex),
  );

const getTraceUpsertShardIndexFromShardName = (
  shardName: string | undefined,
): number | null => {
  if (!shardName) return null;

  const shardIndex =
    shardName === QueueName.TraceUpsert
      ? 0
      : parseInt(shardName.replace(`${QueueName.TraceUpsert}-`, ""), 10);

  if (isNaN(shardIndex)) return null;
  return shardIndex;
};

const getTraceUpsertQueueInstance = ({
  shardingKey,
  shardName,
}: {
  shardingKey?: string;
  shardName?: string;
} = {}): Queue<TQueueJobTypes[QueueName.TraceUpsert]> | null => {
  const shardIndex =
    getTraceUpsertShardIndexFromShardName(shardName) ??
    (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
      ? getShardIndex(shardingKey, env.LANGFUSE_TRACE_UPSERT_QUEUE_SHARD_COUNT)
      : 0);

  if (traceUpsertQueueInstances.has(shardIndex)) {
    return traceUpsertQueueInstances.get(shardIndex) || null;
  }

  const newRedis = createNewRedisInstance({
    enableOfflineQueue: false,
    ...redisQueueRetryOptions,
  });

  const queueName = getTraceUpsertQueueNameForShardIndex(shardIndex);
  const queueInstance = newRedis
    ? new Queue<TQueueJobTypes[QueueName.TraceUpsert]>(queueName, {
        connection: newRedis,
        prefix: getQueuePrefix(queueName),
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 100_000,
          attempts: env.LANGFUSE_TRACE_UPSERT_QUEUE_ATTEMPTS,
          delay: 30_000,
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

  traceUpsertQueueInstances.set(shardIndex, queueInstance);

  return queueInstance;
};

export class TraceUpsertQueue {
  static getShardingKey(params: {
    projectId: string;
    traceId: string;
  }): string {
    return `${params.projectId}-${params.traceId}`;
  }

  public static getShardNames() {
    return getTraceUpsertShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return getTraceUpsertShardIndexFromShardName(shardName);
  }

  /**
   * Get the trace upsert queue instance for the given sharding key or shard name.
   * @param shardingKey - Sharding key hashed to a deterministic shard. Should be `projectId-traceId`.
   * @param shardName - Name of the shard. Should be `trace-upsert-queue-${shardIndex}` or plainly `trace-upsert-queue` for the first shard.
   */
  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.TraceUpsert]> | null {
    return getTraceUpsertQueueInstance({ shardingKey, shardName });
  }
}
