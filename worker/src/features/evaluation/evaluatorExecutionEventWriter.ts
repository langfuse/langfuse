import type { JobConfiguration, JobExecution } from "@prisma/client";
import { EvalTargetObject } from "@langfuse/shared";
import {
  buildEvaluatorExecutionEventRecord,
  EvaluatorExecutionEventStatus,
  EvaluatorType,
  type BuildEvaluatorExecutionEventRecordParams,
  type EvaluatorExecutionQueueMetadata,
  logger,
} from "@langfuse/shared/src/server";

import { ClickhouseWriter, TableName } from "../../services/ClickhouseWriter";
import { env } from "../../env";

type ConfigForMetadata = Pick<
  JobConfiguration,
  "id" | "evalTemplateId" | "scoreName" | "targetObject" | "delay"
>;

type JobExecutionForMetadata = Pick<
  JobExecution,
  | "createdAt"
  | "startTime"
  | "jobConfigurationId"
  | "jobInputTraceId"
  | "jobInputObservationId"
>;

const requireTraceId = (traceId: string | null): string => {
  if (!traceId) {
    throw new Error(
      "Cannot build evaluator execution metadata without trace id",
    );
  }

  return traceId;
};

export const buildEvaluatorExecutionQueueMetadata = (params: {
  config: ConfigForMetadata;
  job: JobExecutionForMetadata;
  scheduledAt?: Date | null;
  scheduleDelayMs?: number | null;
}): EvaluatorExecutionQueueMetadata => ({
  evaluationRuleId: params.config.id,
  evaluatorId: params.config.evalTemplateId,
  evaluatorType: EvaluatorType.LLM_AS_JUDGE,
  scoreName: params.config.scoreName,
  targetObject: params.config
    .targetObject as EvaluatorExecutionQueueMetadata["targetObject"],
  targetTraceId: requireTraceId(params.job.jobInputTraceId),
  targetObservationId:
    params.config.targetObject === EvalTargetObject.TRACE
      ? null
      : params.job.jobInputObservationId,
  scheduledAt:
    params.scheduledAt ?? params.job.startTime ?? params.job.createdAt,
  scheduleDelayMs: params.scheduleDelayMs ?? params.config.delay ?? 0,
});

export const writeEvaluatorExecutionEvent = (
  params: BuildEvaluatorExecutionEventRecordParams,
) => {
  if (env.LANGFUSE_EVALUATOR_EXECUTION_EVENT_WRITE_ENABLED !== "true") {
    return;
  }

  try {
    ClickhouseWriter.getInstance().addToQueue(
      TableName.EvaluatorExecutionEvents,
      buildEvaluatorExecutionEventRecord(params),
    );
  } catch (error) {
    logger.error("Failed to enqueue evaluator execution event", {
      error,
      projectId: params.projectId,
      evaluatorExecutionId: params.evaluatorExecutionId,
      statusAfter: params.statusAfter,
    });
  }
};

export const writeScheduledEvaluatorExecutionEvent = (params: {
  projectId: string;
  evaluatorExecutionId: string;
  metadata: EvaluatorExecutionQueueMetadata;
}) =>
  writeEvaluatorExecutionEvent({
    projectId: params.projectId,
    evaluatorExecutionId: params.evaluatorExecutionId,
    metadata: params.metadata,
    statusAfter: EvaluatorExecutionEventStatus.SCHEDULED,
    transitionKey: "initial",
    eventTs: params.metadata.scheduledAt,
  });
