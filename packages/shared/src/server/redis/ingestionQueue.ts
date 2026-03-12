import { type Queue } from "bullmq";
import { QueueName, type TQueueJobTypes } from "../queues";
import { env } from "../../env";
import { createShardedQueueAccessor } from "./shardedQueue";

const ingestionQueue = createShardedQueueAccessor({
  queueName: QueueName.IngestionQueue,
  shardCount: env.LANGFUSE_INGESTION_QUEUE_SHARD_COUNT,
  errorLabel: "IngestionQueue",
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100_000,
    attempts: 6,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});

const secondaryIngestionQueue = createShardedQueueAccessor({
  queueName: QueueName.IngestionSecondaryQueue,
  shardCount: env.LANGFUSE_INGESTION_SECONDARY_QUEUE_SHARD_COUNT,
  errorLabel: "SecondaryIngestionQueue",
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100_000,
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});

export class IngestionQueue {
  static getShardingKey(params: {
    projectId: string;
    eventBodyId: string;
  }): string {
    return `${params.projectId}-${params.eventBodyId}`;
  }

  public static getShardNames() {
    return ingestionQueue.getShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return ingestionQueue.getShardIndexFromShardName(shardName);
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
    return ingestionQueue.getInstance({ shardingKey, shardName });
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
    return secondaryIngestionQueue.getShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return secondaryIngestionQueue.getShardIndexFromShardName(shardName);
  }

  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.IngestionSecondaryQueue]> | null {
    return secondaryIngestionQueue.getInstance({ shardingKey, shardName });
  }
}
