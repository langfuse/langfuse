import { Queue } from "bullmq";
import { logger } from "../logger";
import { TQueueJobTypes, QueueName } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { getShardIndex } from "./sharding";
import { env } from "../../env";

/** Per-trace Topics summaries; shard by `${projectId}-${traceId}`. */
export class TopicsTraceQueue {
  private static instances: Map<
    number,
    Queue<TQueueJobTypes[QueueName.TopicsTrace]> | null
  > = new Map();

  public static getShardNames() {
    return Array.from(
      { length: env.LANGFUSE_TOPICS_TRACE_QUEUE_SHARD_COUNT },
      (_, i) => `${QueueName.TopicsTrace}${i > 0 ? `-${i}` : ""}`,
    );
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    if (!shardName) return null;

    const shardIndex =
      shardName === QueueName.TopicsTrace
        ? 0
        : parseInt(shardName.replace(`${QueueName.TopicsTrace}-`, ""), 10);

    if (isNaN(shardIndex)) return null;
    return shardIndex;
  }

  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.TopicsTrace]> | null {
    const shardIndex =
      TopicsTraceQueue.getShardIndexFromShardName(shardName) ??
      (env.REDIS_CLUSTER_ENABLED === "true" && shardingKey
        ? getShardIndex(
            shardingKey,
            env.LANGFUSE_TOPICS_TRACE_QUEUE_SHARD_COUNT,
          )
        : 0);

    if (TopicsTraceQueue.instances.has(shardIndex)) {
      return TopicsTraceQueue.instances.get(shardIndex) || null;
    }

    const name = `${QueueName.TopicsTrace}${shardIndex > 0 ? `-${shardIndex}` : ""}`;
    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(name);
    const queueInstance = queueOptionsWithRedis
      ? new Queue<TQueueJobTypes[QueueName.TopicsTrace]>(name, {
          ...queueOptionsWithRedis,
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 10_000,
            attempts: 10,
            backoff: {
              type: "exponential",
              delay: 1000,
            },
          },
        })
      : null;

    queueInstance?.on("error", (err) => {
      logger.error(`TopicsTraceQueue shard ${shardIndex} error`, err);
    });

    TopicsTraceQueue.instances.set(shardIndex, queueInstance);

    return queueInstance;
  }
}
