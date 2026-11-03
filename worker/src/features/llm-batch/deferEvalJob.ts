import { JobExecutionStatus } from "@prisma/client";
import { prisma } from "@langfuse/shared/src/db";
import type { LlmBatchDeferredError } from "./errors";
import { createPrismaLlmBatchStore } from "./store";

/**
 * Parks an evaluation whose LLM call went to a batch job: records the queue
 * job that resumes it and sets the job execution to DELAYED. No error, no
 * retry and no execution trace are written; the batch tick re-enqueues the
 * job once the call has a result.
 */
export async function deferEvalJobToBatch(params: {
  error: LlmBatchDeferredError;
  jobExecutionId: string;
  queueName: string;
  jobName: string;
  jobData: unknown;
}): Promise<void> {
  const { error } = params;
  await createPrismaLlmBatchStore().setResumeTarget({
    id: error.batchRequestId,
    projectId: error.projectId,
    queueName: params.queueName,
    jobName: params.jobName,
    jobData: params.jobData,
  });
  await prisma.jobExecution.update({
    where: { id: params.jobExecutionId, projectId: error.projectId },
    data: { status: JobExecutionStatus.DELAYED },
  });
}
