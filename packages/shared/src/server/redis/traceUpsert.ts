import { QueueName, TQueueJobTypes } from "../queues";
import { type Queue } from "bullmq";
import { env } from "../../env";
import { createShardedQueueAccessor } from "./shardedQueue";

const traceUpsertQueue = createShardedQueueAccessor({
  queueName: QueueName.TraceUpsert,
  shardCount: env.LANGFUSE_TRACE_UPSERT_QUEUE_SHARD_COUNT,
  errorLabel: "TraceUpsertQueue",
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
});

export class TraceUpsertQueue {
  static getShardingKey(params: {
    projectId: string;
    traceId: string;
  }): string {
    return `${params.projectId}-${params.traceId}`;
  }

  public static getShardNames() {
    return traceUpsertQueue.getShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return traceUpsertQueue.getShardIndexFromShardName(shardName);
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
    return traceUpsertQueue.getInstance({ shardingKey, shardName });
  }
}
