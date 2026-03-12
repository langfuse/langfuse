import { Queue, type JobsOptions } from "bullmq";
import { env } from "../../env";
import { logger } from "../logger";
import { type TQueueJobTypes } from "../queues";
import {
  createNewRedisInstance,
  getQueuePrefix,
  redisQueueRetryOptions,
} from "./redis";
import { getShardIndex } from "./sharding";

type QueueInstanceParams = {
  shardingKey?: string;
  shardName?: string;
};

type ShardedQueueConfig<T extends keyof TQueueJobTypes> = {
  queueName: T;
  shardCount: number;
  defaultJobOptions: JobsOptions;
  errorLabel: string;
};

export type ShardedQueueAccessor<T extends keyof TQueueJobTypes> = {
  getInstance(params?: QueueInstanceParams): Queue<TQueueJobTypes[T]> | null;
  getShardIndexFromShardName(shardName: string | undefined): number | null;
  getShardNames(): string[];
};

export const createShardedQueueAccessor = <T extends keyof TQueueJobTypes>(
  config: ShardedQueueConfig<T>,
): ShardedQueueAccessor<T> => {
  const instances = new Map<number, Queue<TQueueJobTypes[T]> | null>();

  const getQueueNameForShardIndex = (shardIndex: number) =>
    `${config.queueName}${shardIndex > 0 ? `-${shardIndex}` : ""}`;

  const getShardNames = () =>
    Array.from({ length: config.shardCount }, (_, shardIndex) =>
      getQueueNameForShardIndex(shardIndex),
    );

  const getShardIndexFromShardName = (
    shardName: string | undefined,
  ): number | null => {
    if (!shardName) return null;

    const shardIndex =
      shardName === config.queueName
        ? 0
        : parseInt(shardName.replace(`${config.queueName}-`, ""), 10);

    if (isNaN(shardIndex)) return null;
    return shardIndex;
  };

  const getInstance = ({
    shardingKey,
    shardName,
  }: QueueInstanceParams = {}): Queue<TQueueJobTypes[T]> | null => {
    const shardIndex =
      getShardIndexFromShardName(shardName) ??
      (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
        ? getShardIndex(shardingKey, config.shardCount)
        : 0);

    if (instances.has(shardIndex)) {
      return instances.get(shardIndex) || null;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    const queueName = getQueueNameForShardIndex(shardIndex);
    const queueInstance = newRedis
      ? new Queue<TQueueJobTypes[T]>(queueName, {
          connection: newRedis,
          prefix: getQueuePrefix(queueName),
          defaultJobOptions: config.defaultJobOptions,
        })
      : null;

    queueInstance?.on("error", (err) => {
      logger.error(`${config.errorLabel} shard ${shardIndex} error`, err);
    });

    instances.set(shardIndex, queueInstance);

    return queueInstance;
  };

  return {
    getInstance,
    getShardIndexFromShardName,
    getShardNames,
  };
};
