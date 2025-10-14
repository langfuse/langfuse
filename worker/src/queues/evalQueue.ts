import { Job } from "bullmq";
import { JobExecutionStatus, QUEUE_ERROR_MESSAGES } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  QueueName,
  TQueueJobTypes,
  logger,
  traceException,
  EvalExecutionQueue,
  QueueJobs,
  getCurrentSpan,
  isLLMCompletionError,
} from "@langfuse/shared/src/server";
import { createEvalJobs, evaluate } from "../features/evaluation/evalService";
import { delayInMs } from "./utils/delays";
import { retryLLMRateLimitError } from "../features/utils";

const nonRetryableLLMErrorMessageSubstrings = [
  "Request timed out",
  "is not valid JSON", // evaluator model is not consistently returning valid JSON on structured output calls
  "Error: Unterminated string in JSON at position", // evaluator model is configured with too low max_tokens, the structured output response is incomplete JSON
  "TypeError", // Zod parsing the response failed. User should update prompt to consistently return expected output structure.
] as const;

function shouldRetryJob(error: unknown): boolean {
  if (isLLMCompletionError(error)) {
    if (error.responseStatusCode >= 400 && error.responseStatusCode < 500) {
      return false;
    }

    const isRetryableLLMCompletionError =
      nonRetryableLLMErrorMessageSubstrings.every(
        (substring) => !error.message.includes(substring),
      );

    return isRetryableLLMCompletionError;
  }

  const isRetryableApplicationError =
    error instanceof Error &&
    Object.values(QUEUE_ERROR_MESSAGES).every(
      (substring) => !error.message.includes(substring),
    );

  return isRetryableApplicationError;
}

export const evalJobTraceCreatorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.TraceUpsert]>,
) => {
  try {
    await createEvalJobs({
      sourceEventType: "trace-upsert",
      event: job.data.payload,
      jobTimestamp: job.data.timestamp,
      enforcedJobTimeScope: "NEW", // we must not execute evals which are intended for existing data only.
    });
    return true;
  } catch (e) {
    logger.error(
      `Failed job Evaluation for traceId ${job.data.payload.traceId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};

export const evalJobDatasetCreatorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.DatasetRunItemUpsert]>,
) => {
  try {
    await createEvalJobs({
      sourceEventType: "dataset-run-item-upsert",
      event: job.data.payload,
      jobTimestamp: job.data.timestamp,
      enforcedJobTimeScope: "NEW", // we must not execute evals which are intended for existing data only.
    });
    return true;
  } catch (e) {
    logger.error(
      `Failed job Evaluation for dataset item: ${job.data.payload.datasetItemId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};

export const evalJobCreatorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.CreateEvalQueue]>,
) => {
  try {
    await createEvalJobs({
      sourceEventType: "ui-create-eval",
      event: job.data.payload,
      jobTimestamp: job.data.timestamp,
    });
    return true;
  } catch (e) {
    logger.error(
      `Failed to create evaluation jobs: ${JSON.stringify(job.data.payload)}`,
      e,
    );
    traceException(e);
    throw e;
  }
};

export const evalJobExecutorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.EvaluationExecution]>,
) => {
  try {
    logger.info("Executing Evaluation Execution Job", job.data);

    const span = getCurrentSpan();

    if (span) {
      span.setAttribute(
        "messaging.bullmq.job.input.jobExecutionId",
        job.data.payload.jobExecutionId,
      );
      span.setAttribute(
        "messaging.bullmq.job.input.projectId",
        job.data.payload.projectId,
      );
      span.setAttribute(
        "messaging.bullmq.job.input.retryBaggage.attempt",
        job.data.retryBaggage?.attempt ?? 0,
      );
    }

    await evaluate({ event: job.data.payload });
    return true;
  } catch (e) {
    // If the job fails with a 429, we want to retry it unless it's older than 24h.
    const hasScheduledRateLimitRetry = await retryLLMRateLimitError(e, job, {
      table: "job_executions",
      idField: "jobExecutionId",
      queue: EvalExecutionQueue.getInstance(),
      queueName: QueueName.EvaluationExecution,
      jobName: QueueJobs.EvaluationExecution,
      delayFn: delayInMs,
    });

    if (hasScheduledRateLimitRetry) return;

    // we are left with non-429 LLM responses and application errors here.
    await prisma.jobExecution.update({
      where: {
        id: job.data.payload.jobExecutionId,
        projectId: job.data.payload.projectId,
      },
      data: {
        status: JobExecutionStatus.ERROR,
        endTime: new Date(),
        error: isLLMCompletionError(e)
          ? e.message
          : "An internal error occurred",
      },
    });

    // Return early and do not throw if job should not be retried
    if (!shouldRetryJob(e)) return;

    traceException(e);
    logger.error(
      `Failed Evaluation_Execution job for id ${job.data.payload.jobExecutionId}`,
      e,
    );

    throw e;
  }
};
