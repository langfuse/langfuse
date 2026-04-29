import type { JobConfiguration, JobExecution } from "@prisma/client";
import {
  buildEvalJobExecutionEventRecord,
  EVAL_JOB_CONFIGURATION_REVISION_DEFAULT,
  EvalJobExecutionEventStatus,
  type BuildEvalJobExecutionEventRecordParams,
  type EvalJobExecutionQueueFields,
  type EvalJobExecutionQueueMetadata,
  logger,
} from "@langfuse/shared/src/server";
import { EvalTargetObject } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

import { ClickhouseWriter, TableName } from "../../services/ClickhouseWriter";

type ConfigWithRevision = Pick<
  JobConfiguration,
  "id" | "evalTemplateId" | "scoreName" | "targetObject" | "delay"
> & {
  jobConfigurationRevision?: number | null;
};

type JobExecutionForMetadata = Pick<
  JobExecution,
  | "createdAt"
  | "startTime"
  | "jobConfigurationId"
  | "jobInputTraceId"
  | "jobInputObservationId"
  | "jobInputDatasetItemId"
  | "jobInputDatasetItemValidFrom"
>;

type ExperimentTargetFields = {
  targetExperimentId?: string | null;
  targetExperimentItemId?: string | null;
  targetExperimentItemRootSpanId?: string | null;
};

export const getJobConfigurationRevision = (config: {
  jobConfigurationRevision?: number | null;
}) =>
  config.jobConfigurationRevision ?? EVAL_JOB_CONFIGURATION_REVISION_DEFAULT;

export const buildEvalJobExecutionQueueMetadata = (params: {
  config: ConfigWithRevision;
  job: JobExecutionForMetadata;
  scheduledAt?: Date | null;
  scheduleDelayMs?: number | null;
  experimentTargetFields?: ExperimentTargetFields;
}): EvalJobExecutionQueueMetadata => ({
  jobConfigurationId: params.config.id,
  jobConfigurationRevision: getJobConfigurationRevision(params.config),
  evalTemplateId: params.config.evalTemplateId,
  scoreName: params.config.scoreName,
  targetObject: params.config
    .targetObject as EvalJobExecutionQueueMetadata["targetObject"],
  targetTraceId: params.job.jobInputTraceId,
  targetObservationId:
    params.config.targetObject === EvalTargetObject.EVENT ||
    params.config.targetObject === EvalTargetObject.EXPERIMENT
      ? params.job.jobInputObservationId
      : null,
  targetDatasetItemId:
    params.config.targetObject === EvalTargetObject.DATASET
      ? params.job.jobInputDatasetItemId
      : null,
  targetDatasetItemValidFrom:
    params.config.targetObject === EvalTargetObject.DATASET
      ? params.job.jobInputDatasetItemValidFrom
      : null,
  targetExperimentId:
    params.config.targetObject === EvalTargetObject.EXPERIMENT
      ? params.experimentTargetFields?.targetExperimentId
      : null,
  targetExperimentItemId:
    params.config.targetObject === EvalTargetObject.EXPERIMENT
      ? params.experimentTargetFields?.targetExperimentItemId
      : null,
  targetExperimentItemRootSpanId:
    params.config.targetObject === EvalTargetObject.EXPERIMENT
      ? params.experimentTargetFields?.targetExperimentItemRootSpanId
      : null,
  scheduledAt:
    params.scheduledAt ?? params.job.startTime ?? params.job.createdAt,
  scheduleDelayMs: params.scheduleDelayMs ?? params.config.delay ?? 0,
});

export const writeEvalJobExecutionEvent = (
  params: BuildEvalJobExecutionEventRecordParams,
) => {
  try {
    ClickhouseWriter.getInstance().addToQueue(
      TableName.JobExecutionEvents,
      buildEvalJobExecutionEventRecord(params),
    );
  } catch (error) {
    logger.warn("Failed to enqueue eval job execution event", {
      error,
      projectId: params.projectId,
      jobExecutionId: params.jobExecutionId,
      statusAfter: params.statusAfter,
    });
  }
};

export const writeScheduledEvalJobExecutionEvent = (params: {
  projectId: string;
  jobExecutionId: string;
  metadata: EvalJobExecutionQueueMetadata;
}) =>
  writeEvalJobExecutionEvent({
    projectId: params.projectId,
    jobExecutionId: params.jobExecutionId,
    metadata: params.metadata,
    statusAfter: EvalJobExecutionEventStatus.SCHEDULED,
    transitionKey: "initial",
    eventTs: params.metadata.scheduledAt,
  });

export const metadataFromQueueFields = (
  fields: EvalJobExecutionQueueFields,
): EvalJobExecutionQueueMetadata | null => {
  if (
    !fields.jobConfigurationId ||
    !fields.jobConfigurationRevision ||
    !fields.targetObject ||
    !fields.scheduledAt
  ) {
    return null;
  }

  return {
    jobConfigurationId: fields.jobConfigurationId,
    jobConfigurationRevision: fields.jobConfigurationRevision,
    evalTemplateId: fields.evalTemplateId,
    scoreName: fields.scoreName,
    targetObject: fields.targetObject,
    targetTraceId: fields.targetTraceId,
    targetObservationId: fields.targetObservationId,
    targetDatasetItemId: fields.targetDatasetItemId,
    targetDatasetItemValidFrom: fields.targetDatasetItemValidFrom,
    targetExperimentId: fields.targetExperimentId,
    targetExperimentItemId: fields.targetExperimentItemId,
    targetExperimentItemRootSpanId: fields.targetExperimentItemRootSpanId,
    scheduledAt: new Date(fields.scheduledAt),
    scheduleDelayMs: fields.scheduleDelayMs ?? 0,
  };
};

export const resolveEvalJobExecutionQueueMetadata = async (params: {
  projectId: string;
  jobExecutionId: string;
  queueFields?: EvalJobExecutionQueueFields;
}): Promise<EvalJobExecutionQueueMetadata | null> => {
  const metadata = params.queueFields
    ? metadataFromQueueFields(params.queueFields)
    : null;

  if (metadata) return metadata;

  try {
    if (typeof prisma.jobExecution.findFirst !== "function") return null;

    const job = await prisma.jobExecution.findFirst({
      where: {
        id: params.jobExecutionId,
        projectId: params.projectId,
      },
      include: {
        jobConfiguration: true,
      },
    });

    if (!job) return null;

    return buildEvalJobExecutionQueueMetadata({
      config: job.jobConfiguration,
      job,
    });
  } catch (error) {
    logger.warn("Failed to resolve eval job execution event metadata", {
      error,
      projectId: params.projectId,
      jobExecutionId: params.jobExecutionId,
    });
    return null;
  }
};
