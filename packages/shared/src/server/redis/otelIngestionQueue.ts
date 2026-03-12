import { type Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { env } from "../../env";
import { createShardedQueueAccessor } from "./shardedQueue";

const otelIngestionQueue = createShardedQueueAccessor({
  queueName: QueueName.OtelIngestionQueue,
  shardCount: env.LANGFUSE_OTEL_INGESTION_QUEUE_SHARD_COUNT,
  errorLabel: "OtelIngestionQueue",
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

export class OtelIngestionQueue {
  static getShardingKey(params: {
    projectId: string;
    fileKey: string;
  }): string {
    return `${params.projectId}-${params.fileKey}`;
  }

  public static getShardNames() {
    return otelIngestionQueue.getShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return otelIngestionQueue.getShardIndexFromShardName(shardName);
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
    return otelIngestionQueue.getInstance({ shardingKey, shardName });
  }
}
