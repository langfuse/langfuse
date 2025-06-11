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

export class IngestionQueue {
  private static instances: Map<
    number,
    Queue<TQueueJobTypes[QueueName.IngestionQueue]> | null
  > = new Map();

  public static getShardNames() {
    return Array.from(
      { length: env.LANGFUSE_INGESTION_QUEUE_SHARD_COUNT },
      (_, i) => `${QueueName.IngestionQueue}${i > 1 ? `-${i}` : ""}`,
    );
  }

  public static getInstance(
    shardingKey: string,
  ): Queue<TQueueJobTypes[QueueName.IngestionQueue]> | null {
    const shardIndex =
      env.REDIS_CLUSTER_ENABLED === "true"
        ? getShardIndex(shardingKey, env.LANGFUSE_INGESTION_QUEUE_SHARD_COUNT)
        : 0;

    // Check if we already have an instance for this shard
    if (IngestionQueue.instances.has(shardIndex)) {
      return IngestionQueue.instances.get(shardIndex) || null;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    const name = `${QueueName.IngestionQueue}${shardIndex > 1 ? `-${shardIndex}` : ""}`;
    const queueInstance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.IngestionQueue]>(name, {
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
      logger.error(`IngestionQueue shard ${shardIndex} error`, err);
    });

    IngestionQueue.instances.set(shardIndex, queueInstance);

    return queueInstance;
  }
}

export class SecondaryIngestionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.IngestionSecondaryQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.IngestionSecondaryQueue]
  > | null {
    if (SecondaryIngestionQueue.instance)
      return SecondaryIngestionQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    SecondaryIngestionQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.IngestionSecondaryQueue]>(
          QueueName.IngestionSecondaryQueue,
          {
            connection: newRedis,
            prefix: getQueuePrefix(QueueName.IngestionSecondaryQueue),
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 100_000,
              attempts: 5,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    SecondaryIngestionQueue.instance?.on("error", (err) => {
      logger.error("SecondaryIngestionQueue error", err);
    });

    return SecondaryIngestionQueue.instance;
  }
}
