import { JobConfiguration, JobExecutionStatus } from "@langfuse/shared/src/db";

/**
 * Re-export ObservationForEval as the canonical observation type for eval operations.
 * This type is used for both filtering and variable extraction.
 *
 * @see packages/shared/src/features/evals/observationForEval.ts for schema definition
 */
export {
  type ObservationForEval,
  observationForEvalSchema,
  observationEvalFilterColumns,
  observationEvalVariableColumns,
} from "@langfuse/shared";

/**
 * Observation eval job configuration.
 * Represents a job configuration with targetObject: "event".
 * Passed to the scheduler after being fetched once per batch.
 */
export type ObservationEvalConfig = Pick<
  JobConfiguration,
  | "id"
  | "projectId"
  | "filter"
  | "sampling"
  | "evalTemplateId"
  | "scoreName"
  | "targetObject"
  | "variableMapping"
>;

/**
 * Dependencies for scheduling observation evals.
 * The scheduler receives pre-fetched configs and creates job executions.
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
    observationId: string;
    data: Record<string, unknown>;
  }) => Promise<string>;

  /** Enqueue the eval job for execution */
  enqueueEvalJob: (params: {
    jobExecutionId: string;
    projectId: string;
    observationS3Path: string;
    delay: number;
  }) => Promise<void>;
}
