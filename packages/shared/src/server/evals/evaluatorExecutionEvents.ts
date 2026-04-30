import { createHash } from "node:crypto";
import { z } from "zod";

import {
  EvalTargetObject,
  EvalTargetObjectSchema,
} from "../../features/evals/types";
import type { EvaluatorExecutionEventRecordInsertType } from "../repositories/definitions";

export const EvaluatorExecutionEventStatus = {
  SCHEDULED: "SCHEDULED",
  RETRYING: "RETRYING",
  COMPLETED: "COMPLETED",
  ERROR: "ERROR",
  CANCELLED: "CANCELLED",
} as const;

export type EvaluatorExecutionEventStatus =
  (typeof EvaluatorExecutionEventStatus)[keyof typeof EvaluatorExecutionEventStatus];

export const EvaluatorExecutionStateTransitionOrder = {
  [EvaluatorExecutionEventStatus.SCHEDULED]: 10,
  [EvaluatorExecutionEventStatus.RETRYING]: 20,
  [EvaluatorExecutionEventStatus.CANCELLED]: 30,
  [EvaluatorExecutionEventStatus.ERROR]: 40,
  [EvaluatorExecutionEventStatus.COMPLETED]: 50,
} as const satisfies Record<EvaluatorExecutionEventStatus, number>;

export const EvaluatorType = {
  LLM_AS_JUDGE: "llm-as-judge",
} as const;

export type EvaluatorType = (typeof EvaluatorType)[keyof typeof EvaluatorType];

export const EvaluatorTypeSchema = z.enum(Object.values(EvaluatorType));

export const EvaluatorExecutionTriggerSource = {
  TRACE_INGESTED: "trace-ingested",
  DATASET_RUN_ITEM_UPSERTED: "dataset-run-item-upserted",
  HISTORIC_TRACE_DATASET_EVALUATION_REQUESTED:
    "historic-trace-dataset-evaluation-requested",
  OBSERVATION_INGESTED: "observation-ingested",
  PROMPT_EXPERIMENT_ITEM_CREATED: "prompt-experiment-item-created",
  HISTORIC_OBSERVATION_EVALUATION_REQUESTED:
    "historic-observation-evaluation-requested",
  HISTORIC_EXPERIMENT_EVALUATION_REQUESTED:
    "historic-experiment-evaluation-requested",
} as const;

export type EvaluatorExecutionTriggerSource =
  (typeof EvaluatorExecutionTriggerSource)[keyof typeof EvaluatorExecutionTriggerSource];

export const EvaluatorExecutionTriggerSourceSchema = z
  .enum(Object.values(EvaluatorExecutionTriggerSource))
  .or(z.literal(""));

export const EvaluatorExecutionQueueMetadataSchema = z.object({
  evaluationRuleId: z.string(),
  evaluatorId: z.string().nullish(),
  evaluatorType: EvaluatorTypeSchema.default(EvaluatorType.LLM_AS_JUDGE),
  triggerSource: EvaluatorExecutionTriggerSourceSchema.default(""),
  scoreName: z.string().nullish(),
  targetObject: EvalTargetObjectSchema,
  targetTraceId: z.string(),
  targetObservationId: z.string().nullish(),
  scheduledAt: z.coerce.date(),
  scheduleDelayMs: z.number().int().nonnegative(),
});

export type EvaluatorExecutionQueueMetadata = z.infer<
  typeof EvaluatorExecutionQueueMetadataSchema
>;

export type EvaluatorExecutionIdentityParams = {
  projectId: string;
  evaluationRuleId: string;
  targetObject: string;
  targetTraceId: string;
  targetObservationId?: string | null;
};

export type BuildEvaluatorExecutionEventRecordParams = {
  projectId: string;
  evaluatorExecutionId: string;
  metadata: EvaluatorExecutionQueueMetadata;
  statusAfter: EvaluatorExecutionEventStatus;
  transitionKey: string;
  eventTs: Date;
  completedAt?: Date | null;
  failedAt?: Date | null;
  nextRetryAt?: Date | null;
  retryAttempt?: number | null;
  maxAttempts?: number | null;
  retryDelayMs?: number | null;
  httpResponseStatusCode?: number | null;
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
  params: EvaluatorExecutionIdentityParams,
): Required<EvaluatorExecutionIdentityParams> => ({
  projectId: params.projectId,
  evaluationRuleId: params.evaluationRuleId,
  targetObject: params.targetObject,
  targetTraceId: params.targetTraceId,
  targetObservationId: normalizeString(params.targetObservationId),
});

const identityParts = (identity: EvaluatorExecutionIdentityParams) => {
  const normalized = normalizeTargetIdentity(identity);

  return [
    "evaluator-execution",
    normalized.projectId,
    normalized.evaluationRuleId,
    normalized.targetObject,
    normalized.targetTraceId,
    normalized.targetObservationId,
  ];
};

export const createEvaluatorExecutionId = (
  params: EvaluatorExecutionIdentityParams,
): string => hashToHexId(identityParts(params));

export const createEvaluatorExecutionEventId = (params: {
  evaluatorExecutionId: string;
  statusAfter: EvaluatorExecutionEventStatus;
  transitionKey: string;
}): string =>
  hashToHexId([
    "evaluator-execution-event",
    params.evaluatorExecutionId,
    params.statusAfter,
    params.transitionKey,
  ]);

export const createEvaluatorScoreId = (params: {
  evaluatorExecutionId: string;
  scoreIndex: number;
}): string =>
  hashToHexId([
    "evaluator-score",
    params.evaluatorExecutionId,
    params.scoreIndex,
  ]);

export const shouldSampleEvaluatorExecution = (params: {
  evaluatorExecutionId: string;
  samplingRate: number;
}): boolean => {
  if (params.samplingRate >= 1) return true;
  if (params.samplingRate <= 0) return false;

  // Map the deterministic execution id into a stable 0..1 bucket. This keeps
  // sampling idempotent across retries and duplicate scheduling attempts.
  const bucket =
    parseInt(
      createHash("sha256")
        .update(`evaluator-execution-sampling:${params.evaluatorExecutionId}`)
        .digest("hex")
        .slice(0, 8),
      16,
    ) / 0xffffffff;

  return bucket <= params.samplingRate;
};

export const buildEvaluatorExecutionEventRecord = ({
  metadata,
  ...params
}: BuildEvaluatorExecutionEventRecordParams): EvaluatorExecutionEventRecordInsertType => {
  return {
    event_id: createEvaluatorExecutionEventId({
      evaluatorExecutionId: params.evaluatorExecutionId,
      statusAfter: params.statusAfter,
      transitionKey: params.transitionKey,
    }),
    event_ts: params.eventTs.getTime(),
    project_id: params.projectId,
    evaluator_execution_id: params.evaluatorExecutionId,
    evaluation_rule_id: metadata.evaluationRuleId,
    evaluator_id: metadata.evaluatorId ?? "",
    evaluator_type: metadata.evaluatorType,
    trigger_source: metadata.triggerSource,
    target_object: metadata.targetObject,
    target_trace_id: metadata.targetTraceId,
    target_observation_id: metadata.targetObservationId ?? "",
    status_after: params.statusAfter,
    state_transition_order:
      EvaluatorExecutionStateTransitionOrder[params.statusAfter],
    scheduled_at: metadata.scheduledAt.getTime(),
    schedule_delay_ms: metadata.scheduleDelayMs,
    completed_at: params.completedAt?.getTime(),
    failed_at: params.failedAt?.getTime(),
    next_retry_at: params.nextRetryAt?.getTime(),
    retry_attempt: params.retryAttempt ?? 0,
    max_attempts: params.maxAttempts,
    retry_delay_ms: params.retryDelayMs ?? 0,
    http_response_status_code: params.httpResponseStatusCode,
    error_kind: params.errorKind ?? "",
    error_message: params.errorMessage ?? "",
    cancellation_reason: params.cancellationReason ?? "",
    execution_trace_id: params.executionTraceId ?? "",
    primary_score_id: params.scoreIds?.[0] ?? "",
    score_ids: params.scoreIds ?? [],
    score_count: params.scoreCount ?? params.scoreIds?.length ?? 0,
    score_name: metadata.scoreName ?? "",
    score_data_type: params.scoreDataType ?? "",
    score_value: params.scoreValue,
    score_string_value: params.scoreStringValue ?? "",
    score_string_values: params.scoreStringValues ?? [],
    score_comment: params.scoreComment ?? "",
    created_at: Date.now(),
  };
};

export const createTraceEvaluatorExecutionIdentity = (params: {
  projectId: string;
  evaluationRuleId: string;
  targetTraceId: string;
}): EvaluatorExecutionIdentityParams => ({
  projectId: params.projectId,
  evaluationRuleId: params.evaluationRuleId,
  targetObject: EvalTargetObject.TRACE,
  targetTraceId: params.targetTraceId,
});

export const createDatasetEvaluatorExecutionIdentity = (params: {
  projectId: string;
  evaluationRuleId: string;
  targetTraceId: string;
  targetObservationId?: string | null;
}): EvaluatorExecutionIdentityParams => ({
  projectId: params.projectId,
  evaluationRuleId: params.evaluationRuleId,
  targetObject: EvalTargetObject.DATASET,
  targetTraceId: params.targetTraceId,
  targetObservationId: params.targetObservationId,
});

export const createEventEvaluatorExecutionIdentity = (params: {
  projectId: string;
  evaluationRuleId: string;
  targetTraceId: string;
  targetObservationId: string;
}): EvaluatorExecutionIdentityParams => ({
  projectId: params.projectId,
  evaluationRuleId: params.evaluationRuleId,
  targetObject: EvalTargetObject.EVENT,
  targetTraceId: params.targetTraceId,
  targetObservationId: params.targetObservationId,
});

export const createExperimentEvaluatorExecutionIdentity = (params: {
  projectId: string;
  evaluationRuleId: string;
  targetTraceId: string;
  targetObservationId: string;
}): EvaluatorExecutionIdentityParams => ({
  projectId: params.projectId,
  evaluationRuleId: params.evaluationRuleId,
  targetObject: EvalTargetObject.EXPERIMENT,
  targetTraceId: params.targetTraceId,
  targetObservationId: params.targetObservationId,
});
