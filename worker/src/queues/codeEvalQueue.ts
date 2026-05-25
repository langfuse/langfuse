import { Job, Processor } from "bullmq";
import { EvalTemplateType, JobExecutionStatus } from "@prisma/client";
import { prisma } from "@langfuse/shared/src/db";
import {
  getCodeEvalUserVisibleError,
  getCurrentSpan,
  logger,
  QueueName,
  TQueueJobTypes,
  traceException,
} from "@langfuse/shared/src/server";
import { processObservationEval } from "../features/evaluation/observationEval";
import { createW3CTraceId } from "../features/utils";
import { isUnrecoverableError } from "../errors/UnrecoverableError";

export const codeEvalExecutionQueueProcessorBuilder = (
  _queueName: string,
): Processor => {
  return async (job: Job<TQueueJobTypes[QueueName.CodeEvalExecution]>) => {
    try {
      logger.debug("Executing Code Evaluation Observation Job", job.data);

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

      await processObservationEval({
        event: job.data.payload,
        executionType: EvalTemplateType.CODE,
      });

      return true;
    } catch (e) {
      const executionTraceId = createW3CTraceId(
        job.data.payload.jobExecutionId,
      );

      const isTerminalError = isUnrecoverableError(e);
      const totalAttempts = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= totalAttempts;

      // Only persist the terminal ERROR state when there will be no more
      // retries; otherwise observationEvalProcessor would short-circuit the
      // retry attempts because it skips jobs already in ERROR status.
      if (isTerminalError || isFinalAttempt) {
        await prisma.jobExecution.update({
          where: {
            id: job.data.payload.jobExecutionId,
            projectId: job.data.payload.projectId,
          },
          data: {
            status: JobExecutionStatus.ERROR,
            endTime: new Date(),
            error: getJobExecutionErrorMessage(e),
            executionTraceId,
          },
        });
      }

      if (isTerminalError) return;

      traceException(e);
      logger.error(
        `Failed code eval execution job for id ${job.data.payload.jobExecutionId}`,
        e,
      );

      throw e;
    }
  };
};

function getJobExecutionErrorMessage(e: unknown): string {
  if (isUnrecoverableError(e)) return e.message;

  return getCodeEvalUserVisibleError(e).message;
}
