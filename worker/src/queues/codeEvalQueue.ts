import { Job, Processor } from "bullmq";
import { JobExecutionStatus } from "@prisma/client";
import {
  assertCodeBasedEvalTemplate,
  type EvalTemplate,
  type EvalTemplateCodeBased,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  getCurrentSpan,
  logger,
  QueueName,
  TQueueJobTypes,
  traceException,
} from "@langfuse/shared/src/server";
import { executeCodeBasedEvaluation } from "../features/evaluation/codeBased";
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
        validateTemplate: validateCodeBasedTemplate,
        executor: executeCodeBasedEvaluation,
      });

      return true;
    } catch (e) {
      const executionTraceId = createW3CTraceId(
        job.data.payload.jobExecutionId,
      );

      const isTerminalError = isUnrecoverableError(e);

      await prisma.jobExecution.update({
        where: {
          id: job.data.payload.jobExecutionId,
          projectId: job.data.payload.projectId,
        },
        data: {
          status: JobExecutionStatus.ERROR,
          endTime: new Date(),
          error: isTerminalError ? e.message : "An internal error occurred",
          executionTraceId,
        },
      });

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

const validateCodeBasedTemplate = (
  template: EvalTemplate,
): EvalTemplateCodeBased => {
  assertCodeBasedEvalTemplate(template);
  return template;
};
