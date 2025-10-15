import { Job } from "bullmq";
import { JobExecutionStatus } from "@langfuse/shared";
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
import { createW3CTraceId, retryLLMRateLimitError } from "../features/utils";
import { isUnrecoverableError } from "../errors/UnrecoverableError";

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
    // ┌─────────────────────────┐
    // │   Job Fails with Error  │
    // └───────────┬─────────────┘
    //             │
    //             ▼
    // ┌────────────────────────────────────────┐
    // │ Is it LLMCompletionError with          │
    // │ isRetryable=true (429/5xx)?            │
    // └─────┬──────────────────────────────┬───┘
    //       │ Yes                          │ No
    //       ▼                              ▼
    // ┌──────────────────┐       ┌───────────────────────┐
    // │ Is job < 24h old?│       │ Is it retryable?      │
    // └─────┬──────┬─────┘       │ (shouldRetryJob)      │
    //   Yes │      │ No          └─────┬─────────────┬───┘
    //       ▼      ▼                Yes│             │No
    // ┌─────────┐ ┌────────┐          ▼             ▼
    // │Set:     │ │Set:    │    ┌─────────┐  ┌──────────┐
    // │DELAYED  │ │ERROR   │    │BullMQ   │  │Set:      │
    // │Retry in │ │Stop    │    │retry    │  │ERROR     │
    // │1-25 min │ │        │    │w/ exp.  │  │Done      │
    // └─────────┘ └────────┘    │backoff  │  └──────────┘
    //                           └─────────┘

    const executionTraceId = createW3CTraceId(job.data.payload.jobExecutionId);

    if (isLLMCompletionError(e) && e.isRetryable) {
      await retryLLMRateLimitError(job, {
        table: "job_executions",
        idField: "jobExecutionId",
        queue: EvalExecutionQueue.getInstance(),
        queueName: QueueName.EvaluationExecution,
        jobName: QueueJobs.EvaluationExecution,
        delayFn: delayInMs,
      });

      // Use the deterministic execution trace ID to update the job execution
      await prisma.jobExecution.update({
        where: {
          id: job.data.payload.jobExecutionId,
          projectId: job.data.payload.projectId,
        },
        data: {
          status: JobExecutionStatus.DELAYED,
          executionTraceId,
        },
      });

      // Return early as we have already scheduled a delayed retry
      return;
    }

    // At this point there will be only 4xx LLMCompletionErrors that are not retryable and application errors
    await prisma.jobExecution.update({
      where: {
        id: job.data.payload.jobExecutionId,
        projectId: job.data.payload.projectId,
      },
      data: {
        status: JobExecutionStatus.ERROR,
        endTime: new Date(),
        // Show user-facing error messages (LLM and config errors)
        error:
          isLLMCompletionError(e) || isUnrecoverableError(e)
            ? e.message
            : "An internal error occurred",
        executionTraceId,
      },
    });

    if (isLLMCompletionError(e) || isUnrecoverableError(e)) return;

    traceException(e);
    logger.error(
      `Failed Evaluation_Execution job for id ${job.data.payload.jobExecutionId}`,
      e,
    );

    // Retry job by rethrowing error
    throw e;
  }
};
