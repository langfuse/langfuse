import {
  EvaluationRule,
  EvaluationRuleEvaluatorAssignment,
  Evaluator,
  EvalTemplate,
  EvalTemplateType,
  JobConfiguration,
  JobExecutionStatus,
} from "@langfuse/shared/src/db";
import { type EvalExecutionMode } from "@langfuse/shared";
import type {
  EvalTargetObject,
  FilterState,
  ObservationVariableMapping,
} from "@langfuse/shared";

/**
 * Re-export ObservationForEval as the canonical observation type for eval operations.
 * This type is used for both filtering and variable extraction.
 *
 * @see packages/shared/src/features/evals/observationForEval.ts for schema definition
 */
export { type ObservationForEval } from "@langfuse/shared";

/**
 * Observation eval job configuration.
 * Represents a job configuration with targetObject: "event".
 * Passed to the scheduler after being fetched once per batch.
 */
export type LegacyObservationEvalConfig = Pick<
  JobConfiguration,
  | "id"
  | "projectId"
  | "sampling"
  | "evalTemplateId"
  | "scoreName"
  | "variableMapping"
  | "status"
  | "blockedAt"
> & {
  filter: FilterState;
  targetObject: EvalTargetObject;
  evalTemplate: Pick<EvalTemplate, "type">;
};

/**
 * Dispatch only needs to know *which* evaluator runs and on which queue; the
 * executor resolves the definition, so no version is carried here.
 */
export type ObservationEvalAssignment = Pick<
  EvaluationRuleEvaluatorAssignment,
  "id" | "evaluatorId" | "variableMapping"
> & {
  evaluator: Pick<Evaluator, "id" | "projectId" | "type">;
};

export type EvaluationRuleWithAssignments = Pick<
  EvaluationRule,
  "projectId" | "sampling" | "status"
> & {
  /**
   * Anchor written to `job_executions.job_configuration_id`: the rule id, or
   * the evaluator id when a ruleless manual batch run has no associated rule.
   */
  id: string;
  /** Null when no rule is involved, i.e. for manual batch runs. */
  ruleId: string | null;
  filter: FilterState;
  targetObject: EvalTargetObject;
  assignments: ObservationEvalAssignment[];
};

/**
 * What the scheduler matches an observation against: an evaluation rule, or
 * the legacy job configuration it replaced (still reachable through manual
 * batch jobs). Live scheduling only fetches evaluation rules.
 *
 * Callers pass canonical rules: the experiment target is already normalized to
 * `event` plus its root-span filter (see normalizeEvaluationRuleTarget), so
 * the scheduler only ever evaluates plain filters.
 */
export type ObservationEvalRule =
  | EvaluationRuleWithAssignments
  | LegacyObservationEvalConfig;

/**
 * Dependencies for scheduling observation evals.
 * The scheduler receives pre-fetched rules and creates job executions.
 */
export interface ObservationEvalSchedulerDeps {
  /** Create a job execution record in the database */
  upsertJobExecution: (params: {
    id: string;
    projectId: string;
    jobConfigurationId: string;
    jobInputTraceId: string;
    jobInputObservationId: string;
    jobTemplateId: string | null;
    status: JobExecutionStatus;
  }) => Promise<{ id: string }>;

  /** Upload observation data to S3 for later retrieval */
  uploadObservationToS3: (params: {
    projectId: string;
    traceId: string;
    observationId: string;
    data: Record<string, unknown>;
  }) => Promise<string>;

  /** Enqueue the eval job for execution */
  enqueueEvalJob: (params: {
    jobExecutionId: string;
    projectId: string;
    observationS3Path: string;
    delay: number;
    evalTemplateType: EvalTemplateType;
    executionMode?: EvalExecutionMode;
    /** Evaluator v2 identity; omitted when scheduling a legacy config. */
    evaluatorId?: string;
    evaluationRuleId?: string;
    /**
     * Mapping override for a ruleless batch run. Omitted to inherit the
     * evaluator version mapping.
     */
    variableMapping?: ObservationVariableMapping[];
  }) => Promise<void>;
}
