import { Queue } from "bullmq";

import {
  QueueName,
  getQueue,
  IngestionQueue,
  SecondaryIngestionQueue,
  OtelIngestionQueue,
  TraceUpsertQueue,
  EvalExecutionQueue,
  SecondaryEvalExecutionQueue,
  LLMAsJudgeExecutionQueue,
} from "@langfuse/shared/src/server";

export type ShardedQueueDef = {
  baseQueueName: QueueName;
  getShardNames: () => string[];
  getInstance: (shardName: string) => Queue | null;
};

export const SHARDED_QUEUES: ShardedQueueDef[] = [
  {
    baseQueueName: QueueName.IngestionQueue,
    getShardNames: () => IngestionQueue.getShardNames(),
    getInstance: (shard) => IngestionQueue.getInstance({ shardName: shard }),
  },
  {
    baseQueueName: QueueName.IngestionSecondaryQueue,
    getShardNames: () => SecondaryIngestionQueue.getShardNames(),
    getInstance: (shard) =>
      SecondaryIngestionQueue.getInstance({ shardName: shard }),
  },
  {
    baseQueueName: QueueName.OtelIngestionQueue,
    getShardNames: () => OtelIngestionQueue.getShardNames(),
    getInstance: (shard) =>
      OtelIngestionQueue.getInstance({ shardName: shard }),
  },
  {
    baseQueueName: QueueName.TraceUpsert,
    getShardNames: () => TraceUpsertQueue.getShardNames(),
    getInstance: (shard) => TraceUpsertQueue.getInstance({ shardName: shard }),
  },
  {
    baseQueueName: QueueName.EvaluationExecution,
    getShardNames: () => EvalExecutionQueue.getShardNames(),
    getInstance: (shard) =>
      EvalExecutionQueue.getInstance({ shardName: shard }),
  },
  {
    baseQueueName: QueueName.EvaluationExecutionSecondaryQueue,
    getShardNames: () => SecondaryEvalExecutionQueue.getShardNames(),
    getInstance: (shard) =>
      SecondaryEvalExecutionQueue.getInstance({ shardName: shard }),
  },
  {
    baseQueueName: QueueName.LLMAsJudgeExecution,
    getShardNames: () => LLMAsJudgeExecutionQueue.getShardNames(),
    getInstance: (shard) =>
      LLMAsJudgeExecutionQueue.getInstance({ shardName: shard }),
  },
];

export const SHARDED_QUEUE_BASE_NAMES = new Set<QueueName>(
  SHARDED_QUEUES.map((q) => q.baseQueueName),
);

/**
 * Resolve a queue name (possibly a shard name like "ingestion-queue-1") to its
 * BullMQ Queue instance. Checks sharded queues first, then falls back to
 * non-sharded getQueue().
 */
export function resolveQueueInstance(queueName: string): Queue | null {
  for (const def of SHARDED_QUEUES) {
    if (queueName.startsWith(def.baseQueueName)) {
      return def.getInstance(queueName);
    }
  }

  return getQueue(
    queueName as Exclude<
      QueueName,
      | QueueName.IngestionQueue
      | QueueName.IngestionSecondaryQueue
      | QueueName.EvaluationExecution
      | QueueName.EvaluationExecutionSecondaryQueue
      | QueueName.LLMAsJudgeExecution
      | QueueName.TraceUpsert
      | QueueName.OtelIngestionQueue
    >,
  );
}
