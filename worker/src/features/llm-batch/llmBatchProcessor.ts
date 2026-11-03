import { Processor, type Queue } from "bullmq";
import { JobExecutionStatus } from "@prisma/client";
import { prisma } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
import {
  createVertexBatchProvider,
  EvalExecutionQueue,
  LLMAsJudgeExecutionQueue,
  logger,
  QueueJobs,
  QueueName,
  SecondaryEvalExecutionQueue,
  type LlmBatchProvider,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { hasBatchConfig, runLlmBatchTick } from "./llmBatchService";
import { createPrismaLlmBatchStore, type LlmBatchRow } from "./store";

/** Batch provider for a connection, or null if it has no batch config. */
async function getProvider(
  llmApiKeyId: string,
): Promise<LlmBatchProvider | null> {
  const connection = await prisma.llmApiKeys.findUnique({
    where: { id: llmApiKeyId },
    select: { adapter: true, secretKey: true, config: true },
  });
  if (!connection || !hasBatchConfig(connection)) {
    return null;
  }
  return createVertexBatchProvider({
    apiKey: decrypt(connection.secretKey),
    config: connection.config as Parameters<
      typeof createVertexBatchProvider
    >[0]["config"],
  });
}

/** The eval queue (shard) a deferred evaluation came from. */
function resolveEvalQueue(queueName: string): Queue | null {
  if (queueName.startsWith(QueueName.EvaluationExecutionSecondaryQueue)) {
    return SecondaryEvalExecutionQueue.getInstance({ shardName: queueName });
  }
  if (queueName.startsWith(QueueName.EvaluationExecution)) {
    return EvalExecutionQueue.getInstance({ shardName: queueName });
  }
  if (queueName.startsWith(QueueName.LLMAsJudgeExecution)) {
    return LLMAsJudgeExecutionQueue.getInstance({ shardName: queueName });
  }
  return null;
}

/**
 * Re-enqueues a deferred evaluation. Idempotent: the queue job id is stable
 * per row, and an evaluation that is no longer DELAYED (it already ran, or
 * was cancelled or deleted) is not enqueued again.
 */
async function resume(row: LlmBatchRow): Promise<void> {
  if (!row.resumeQueueName || !row.resumeJobName) return;
  const jobExecution = await prisma.jobExecution.findUnique({
    where: { id: row.jobExecutionId, projectId: row.projectId },
    select: { status: true },
  });
  if (jobExecution?.status !== JobExecutionStatus.DELAYED) return;

  const queue = resolveEvalQueue(row.resumeQueueName);
  if (!queue) {
    throw new Error(`Unknown eval queue ${row.resumeQueueName}`);
  }
  await queue.add(row.resumeJobName, row.resumeJobData, {
    jobId: `llm-batch-resume-${row.id}`,
  });
}

export const llmBatchProcessor: Processor = async (job) => {
  if (job.name !== QueueJobs.LlmBatchJob) return;

  const result = await runLlmBatchTick({
    store: createPrismaLlmBatchStore(),
    getProvider,
    resume,
    settings: {
      flushAfterSeconds: env.LANGFUSE_LLM_BATCH_FLUSH_AFTER_SECONDS,
      maxRequestsPerJob: env.LANGFUSE_LLM_BATCH_MAX_REQUESTS_PER_JOB,
      maxAgeSeconds: env.LANGFUSE_LLM_BATCH_MAX_AGE_SECONDS,
      retentionDays: env.LANGFUSE_LLM_BATCH_RETENTION_DAYS,
    },
    log: (level, message) => logger[level](`[llm-batch] ${message}`),
  });

  if (Object.values(result).some((n) => n > 0)) {
    logger.info("[llm-batch] tick", result);
  }
};
