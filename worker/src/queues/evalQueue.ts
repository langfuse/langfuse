import { Job, Processor } from "bullmq";
import { JobExecutionStatus } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  QueueName,
  TQueueJobTypes,
  logger,
  traceException,
  LLMAsJudgeExecutionQueue,
  QueueJobs,
  getCurrentSpan,
  isLLMCompletionError,
  getQueue,
} from "@langfuse/shared/src/server";
import { createEvalJobs, evaluate } from "../features/evaluation/evalService";
import { processObservationEval } from "../features/evaluation/observationEval";
import { delayInMs } from "./utils/delays";
import { createW3CTraceId, retryLLMRateLimitError } from "../features/utils";
import { isUnrecoverableError } from "../errors/UnrecoverableError";
import { retryObservationNotFound } from "../features/evaluation/retryObservationNotFound";
import { isObservationNotFoundError } from "../errors/ObservationNotFoundError";
import { env } from "../env";

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
    // Handle observation-not-found errors with manual retry
    if (isObservationNotFoundError(e)) {
      const shouldRetry = await retryObservationNotFound(e, {
        data: {
          projectId: job.data.payload.projectId,
          datasetItemId: job.data.payload.datasetItemId,
          traceId: job.data.payload.traceId,
          observationId: job.data.payload.observationId,
          retryBaggage: job.data.retryBaggage,
        },
      });

      if (shouldRetry) {
        // Retry was scheduled, complete this job successfully
        return true;
      } else {
        // Max attempts reached, log warning and complete successfully
        logger.warn(
          `Observation not found after max retries. Completing job without creating eval.`,
          {
            projectId: job.data.payload.projectId,
            datasetItemId: job.data.payload.datasetItemId,
            observationId: job.data.payload.observationId,
            traceId: job.data.payload.traceId,
          },
        );
        return true;
      }
    }

    // All other errors should be logged and propagated for BullMQ retry
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

type EvalExecutionQueueName =
  | QueueName.EvaluationExecution
  | QueueName.EvaluationExecutionSecondaryQueue;

export const evalJobExecutorQueueProcessorBuilder = (
  enableRedirectToSecondaryQueue: boolean,
  queueName: EvalExecutionQueueName,
): Processor => {
  const projectIdsToRedirectToSecondaryQueue =
    env.LANGFUSE_SECONDARY_EVAL_EXECUTION_QUEUE_ENABLED_PROJECT_IDS?.split(
      ",",
    ) ?? [];

  return async (job: Job<TQueueJobTypes[QueueName.EvaluationExecution]>) => {
    try {
      logger.info("Executing Evaluation Execution Job", job.data);

      // Redirect selected projects to the secondary queue from the primary consumer.
      if (enableRedirectToSecondaryQueue) {
        const projectId = job.data.payload.projectId;
        const shouldRedirectToSecondaryQueue =
          projectIdsToRedirectToSecondaryQueue.includes(projectId);

        if (shouldRedirectToSecondaryQueue) {
          logger.debug(
            `Redirecting evaluation execution job to secondary queue for project ${projectId}`,
          );
          const secondaryQueue = getQueue(
            QueueName.EvaluationExecutionSecondaryQueue,
          );
          if (!secondaryQueue) {
            throw new Error(
              "Secondary evaluation execution queue is not available",
            );
          }

          await secondaryQueue.add(
            QueueName.EvaluationExecutionSecondaryQueue,
            job.data,
          );
          return;
        }
      }

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

      const executionTraceId = createW3CTraceId(
        job.data.payload.jobExecutionId,
      );

      if (isLLMCompletionError(e) && e.isRetryable) {
        await retryLLMRateLimitError(job, {
          table: "job_executions",
          idField: "jobExecutionId",
          queue: getQueue(queueName),
          queueName,
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
        `Failed ${queueName} job for id ${job.data.payload.jobExecutionId}`,
        e,
      );

      // Retry job by rethrowing error
      throw e;
    }
  };
};

/**
 * Processor for observation-level LLM-as-a-judge evaluation jobs.
 * This handles evals triggered during OTEL ingestion for single observations.
 */
export const llmAsJudgeExecutionQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.LLMAsJudgeExecution]>,
) => {
  try {
    logger.debug("Executing LLM-as-Judge Observation Evaluation Job", job.data);

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

    await processObservationEval({ event: job.data.payload });
    return true;
  } catch (e) {
    const executionTraceId = createW3CTraceId(job.data.payload.jobExecutionId);

    if (isLLMCompletionError(e) && e.isRetryable) {
      await retryLLMRateLimitError(job, {
        table: "job_executions",
        idField: "jobExecutionId",
        queue: LLMAsJudgeExecutionQueue.getInstance(),
        queueName: QueueName.LLMAsJudgeExecution,
        jobName: QueueJobs.LLMAsJudgeExecution,
        delayFn: delayInMs,
      });

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

      return;
    }

    await prisma.jobExecution.update({
      where: {
        id: job.data.payload.jobExecutionId,
        projectId: job.data.payload.projectId,
      },
      data: {
        status: JobExecutionStatus.ERROR,
        endTime: new Date(),
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
      `Failed LLM-as-Judge execution job for id ${job.data.payload.jobExecutionId}`,
      e,
    );

    throw e;
  }
};
