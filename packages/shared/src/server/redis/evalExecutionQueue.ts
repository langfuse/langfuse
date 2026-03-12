import { type Queue } from "bullmq";
import { TQueueJobTypes, QueueName } from "../queues";
import { env } from "../../env";
import { createShardedQueueAccessor } from "./shardedQueue";

const evalExecutionQueue = createShardedQueueAccessor({
  queueName: QueueName.EvaluationExecution,
  shardCount: env.LANGFUSE_EVAL_EXECUTION_QUEUE_SHARD_COUNT,
  errorLabel: "EvalExecutionQueue",
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 10_000,
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});

const secondaryEvalExecutionQueue = createShardedQueueAccessor({
  queueName: QueueName.EvaluationExecutionSecondaryQueue,
  shardCount: env.LANGFUSE_EVAL_EXECUTION_SECONDARY_QUEUE_SHARD_COUNT,
  errorLabel: "SecondaryEvalExecutionQueue",
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 10_000,
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});

export class EvalExecutionQueue {
  static getShardingKey(params: {
    projectId: string;
    jobExecutionId: string;
  }): string {
    return `${params.projectId}-${params.jobExecutionId}`;
  }

  public static getShardNames() {
    return evalExecutionQueue.getShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return evalExecutionQueue.getShardIndexFromShardName(shardName);
  }

  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.EvaluationExecution]> | null {
    return evalExecutionQueue.getInstance({ shardingKey, shardName });
  }
}

export class SecondaryEvalExecutionQueue {
  static getShardingKey(params: {
    projectId: string;
    jobExecutionId: string;
  }): string {
    return EvalExecutionQueue.getShardingKey(params);
  }

  public static getShardNames() {
    return secondaryEvalExecutionQueue.getShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return secondaryEvalExecutionQueue.getShardIndexFromShardName(shardName);
  }

  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<
    TQueueJobTypes[QueueName.EvaluationExecutionSecondaryQueue]
  > | null {
    return secondaryEvalExecutionQueue.getInstance({ shardingKey, shardName });
  }
}
