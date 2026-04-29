import { createHash } from "node:crypto";
import { z } from "zod";

import {
  EvalTargetObject,
  EvalTargetObjectSchema,
} from "../../features/evals/types";
import type { JobExecutionEventRecordInsertType } from "../repositories/definitions";

export const EvalJobExecutionEventStatus = {
  SCHEDULED: "SCHEDULED",
  RETRYING: "RETRYING",
  COMPLETED: "COMPLETED",
  ERROR: "ERROR",
  CANCELLED: "CANCELLED",
} as const;

export type EvalJobExecutionEventStatus =
  (typeof EvalJobExecutionEventStatus)[keyof typeof EvalJobExecutionEventStatus];

export const EvalJobExecutionStateTransitionOrder = {
  [EvalJobExecutionEventStatus.SCHEDULED]: 10,
  [EvalJobExecutionEventStatus.RETRYING]: 20,
  [EvalJobExecutionEventStatus.CANCELLED]: 30,
  [EvalJobExecutionEventStatus.ERROR]: 40,
  [EvalJobExecutionEventStatus.COMPLETED]: 50,
} as const satisfies Record<EvalJobExecutionEventStatus, number>;

export const EvalJobExecutionQueueMetadataSchema = z.object({
  jobConfigurationId: z.string(),
  evalTemplateId: z.string().nullish(),
  scoreName: z.string().nullish(),
  targetObject: EvalTargetObjectSchema,
  targetTraceId: z.string().nullish(),
  targetObservationId: z.string().nullish(),
  scheduledAt: z.coerce.date(),
  scheduleDelayMs: z.number().int().nonnegative(),
});

export const EvalJobExecutionQueueFieldsSchema =
  EvalJobExecutionQueueMetadataSchema.partial();

export type EvalJobExecutionQueueMetadata = z.infer<
  typeof EvalJobExecutionQueueMetadataSchema
>;

export type EvalJobExecutionQueueFields = z.infer<
  typeof EvalJobExecutionQueueFieldsSchema
>;

export type EvalJobExecutionIdentityParams = {
  projectId: string;
  jobConfigurationId: string;
  targetObject: string;
  targetTraceId?: string | null;
  targetObservationId?: string | null;
};

export type BuildEvalJobExecutionEventRecordParams = {
  projectId: string;
  jobExecutionId: string;
  metadata?: Partial<EvalJobExecutionQueueMetadata> | null;
  statusAfter: EvalJobExecutionEventStatus;
  transitionKey: string;
  eventTs: Date;
  completedAt?: Date | null;
  failedAt?: Date | null;
  nextRetryAt?: Date | null;
  retryAttempt?: number | null;
  maxAttempts?: number | null;
  retryDelayMs?: number | null;
  responseStatusCode?: number | null;
  errorKind?: string | null;
  errorMessage?: string | null;
  cancellationReason?: string | null;
  executionTraceId?: string | null;
  scoreIds?: string[];
  scoreCount?: number | null;
  scoreDataType?: string | null;
  scoreValue?: number | null;
  scoreStringValue?: string | null;
  scoreStringValues?: string[];
  scoreComment?: string | null;
};

const hashToHexId = (parts: unknown[]): string =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);

const normalizeString = (value?: string | null): string => value ?? "";

const normalizeTargetIdentity = (
  params: EvalJobExecutionIdentityParams,
): Required<EvalJobExecutionIdentityParams> => ({
  projectId: params.projectId,
  jobConfigurationId: params.jobConfigurationId,
  targetObject: params.targetObject,
  targetTraceId: normalizeString(params.targetTraceId),
  targetObservationId: normalizeString(params.targetObservationId),
});

const identityParts = (identity: EvalJobExecutionIdentityParams) => {
  const normalized = normalizeTargetIdentity(identity);

  return [
    "eval-job-execution",
    normalized.projectId,
    normalized.jobConfigurationId,
    normalized.targetObject,
    normalized.targetTraceId,
    normalized.targetObservationId,
  ];
};

export const createEvalJobExecutionId = (
  params: EvalJobExecutionIdentityParams,
): string => hashToHexId(identityParts(params));

export const createEvalJobExecutionEventId = (params: {
  jobExecutionId: string;
  statusAfter: EvalJobExecutionEventStatus;
  transitionKey: string;
}): string =>
  hashToHexId([
    "eval-job-execution-event",
    params.jobExecutionId,
    params.statusAfter,
    params.transitionKey,
  ]);

export const createEvalScoreId = (params: {
  jobExecutionId: string;
  scoreIndex: number;
}): string =>
  hashToHexId(["eval-score", params.jobExecutionId, params.scoreIndex]);

export const createEvalScoreEventId = (params: {
  jobExecutionId: string;
  scoreIndex: number;
}): string =>
  hashToHexId(["eval-score-event", params.jobExecutionId, params.scoreIndex]);

export const shouldSampleEvalJob = (params: {
  jobExecutionId: string;
  samplingRate: number;
}): boolean => {
  if (params.samplingRate >= 1) return true;
  if (params.samplingRate <= 0) return false;

  const bucket =
    parseInt(
      createHash("sha256")
        .update(`eval-job-sampling:${params.jobExecutionId}`)
        .digest("hex")
        .slice(0, 8),
      16,
    ) / 0xffffffff;

  return bucket <= params.samplingRate;
};

export const buildEvalJobExecutionEventRecord = ({
  metadata,
  ...params
}: BuildEvalJobExecutionEventRecordParams): JobExecutionEventRecordInsertType => {
  const normalizedMetadata = {
    jobConfigurationId: metadata?.jobConfigurationId ?? "",
    evalTemplateId: metadata?.evalTemplateId ?? "",
    scoreName: metadata?.scoreName ?? "",
    targetObject: metadata?.targetObject ?? "",
    targetTraceId: metadata?.targetTraceId ?? "",
    targetObservationId: metadata?.targetObservationId ?? "",
    scheduledAt: metadata?.scheduledAt ?? params.eventTs,
    scheduleDelayMs: metadata?.scheduleDelayMs ?? 0,
  };

  return {
    event_id: createEvalJobExecutionEventId({
      jobExecutionId: params.jobExecutionId,
      statusAfter: params.statusAfter,
      transitionKey: params.transitionKey,
    }),
    event_ts: params.eventTs.getTime(),
    project_id: params.projectId,
    job_execution_id: params.jobExecutionId,
    job_configuration_id: normalizedMetadata.jobConfigurationId,
    eval_template_id: normalizedMetadata.evalTemplateId,
    target_object: normalizedMetadata.targetObject,
    target_trace_id: normalizedMetadata.targetTraceId,
    target_observation_id: normalizedMetadata.targetObservationId,
    status_after: params.statusAfter,
    state_transition_order:
      EvalJobExecutionStateTransitionOrder[params.statusAfter],
    scheduled_at: normalizedMetadata.scheduledAt.getTime(),
    schedule_delay_ms: normalizedMetadata.scheduleDelayMs,
    completed_at: params.completedAt?.getTime(),
    failed_at: params.failedAt?.getTime(),
    next_retry_at: params.nextRetryAt?.getTime(),
    retry_attempt: params.retryAttempt ?? 0,
    max_attempts: params.maxAttempts ?? 0,
    retry_delay_ms: params.retryDelayMs ?? 0,
    response_status_code: params.responseStatusCode ?? 0,
    error_kind: params.errorKind ?? "",
    error_message: params.errorMessage ?? "",
    cancellation_reason: params.cancellationReason ?? "",
    execution_trace_id: params.executionTraceId ?? "",
    primary_score_id: params.scoreIds?.[0] ?? "",
    score_ids: params.scoreIds ?? [],
    score_count: params.scoreCount ?? params.scoreIds?.length ?? 0,
    score_name: normalizedMetadata.scoreName,
    score_data_type: params.scoreDataType ?? "",
    score_value: params.scoreValue,
    score_string_value: params.scoreStringValue ?? "",
    score_string_values: params.scoreStringValues ?? [],
    score_comment: params.scoreComment ?? "",
    created_at: Date.now(),
  };
};

export const createTraceEvalJobExecutionIdentity = (params: {
  projectId: string;
  jobConfigurationId: string;
  targetTraceId: string;
}): EvalJobExecutionIdentityParams => ({
  projectId: params.projectId,
  jobConfigurationId: params.jobConfigurationId,
  targetObject: EvalTargetObject.TRACE,
  targetTraceId: params.targetTraceId,
});

export const createDatasetEvalJobExecutionIdentity = (params: {
  projectId: string;
  jobConfigurationId: string;
  targetTraceId: string;
}): EvalJobExecutionIdentityParams => ({
  projectId: params.projectId,
  jobConfigurationId: params.jobConfigurationId,
  targetObject: EvalTargetObject.DATASET,
  targetTraceId: params.targetTraceId,
});

export const createEventEvalJobExecutionIdentity = (params: {
  projectId: string;
  jobConfigurationId: string;
  targetTraceId: string;
  targetObservationId: string;
}): EvalJobExecutionIdentityParams => ({
  projectId: params.projectId,
  jobConfigurationId: params.jobConfigurationId,
  targetObject: EvalTargetObject.EVENT,
  targetTraceId: params.targetTraceId,
  targetObservationId: params.targetObservationId,
});

export const createExperimentEvalJobExecutionIdentity = (params: {
  projectId: string;
  jobConfigurationId: string;
  targetTraceId: string;
  targetObservationId: string;
}): EvalJobExecutionIdentityParams => ({
  projectId: params.projectId,
  jobConfigurationId: params.jobConfigurationId,
  targetObject: EvalTargetObject.EXPERIMENT,
  targetTraceId: params.targetTraceId,
  targetObservationId: params.targetObservationId,
});
