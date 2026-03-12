import { type Queue } from "bullmq";
import { TQueueJobTypes, QueueName } from "../queues";
import { env } from "../../env";
import { createShardedQueueAccessor } from "./shardedQueue";

const llmAsJudgeExecutionQueue = createShardedQueueAccessor({
  queueName: QueueName.LLMAsJudgeExecution,
  shardCount: env.LANGFUSE_LLM_AS_JUDGE_EXECUTION_QUEUE_SHARD_COUNT,
  errorLabel: "LLMAsJudgeExecutionQueue",
  defaultJobOptions: {
    removeOnComplete: 10_000,
    removeOnFail: 10_000,
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});

export class LLMAsJudgeExecutionQueue {
  static getShardingKey(params: {
    projectId: string;
    jobExecutionId: string;
  }): string {
    return `${params.projectId}-${params.jobExecutionId}`;
  }

  public static getShardNames() {
    return llmAsJudgeExecutionQueue.getShardNames();
  }

  static getShardIndexFromShardName(
    shardName: string | undefined,
  ): number | null {
    return llmAsJudgeExecutionQueue.getShardIndexFromShardName(shardName);
  }

  public static getInstance({
    shardingKey,
    shardName,
  }: {
    shardingKey?: string;
    shardName?: string;
  } = {}): Queue<TQueueJobTypes[QueueName.LLMAsJudgeExecution]> | null {
    return llmAsJudgeExecutionQueue.getInstance({ shardingKey, shardName });
  }
}
