import { type Prisma } from "@langfuse/shared/src/db";

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
 * Re-export the EventInput converter for use in the OTEL ingestion queue.
 */
export { convertEventInputToObservationForEval } from "./convertEventInputToObservationForEval";

/**
 * Observation eval job configuration.
 * Represents a job configuration with filterTarget: "observation".
 * Passed to the scheduler after being fetched once per batch.
 */
export interface ObservationEvalConfig {
  id: string;
  projectId: string;
  filter: Prisma.JsonValue;
  sampling: Prisma.Decimal;
  evalTemplateId: string;
  scoreName: string;
  targetObject: string;
  variableMapping: Prisma.JsonValue;
  delay: number;
}

/**
 * Dependencies for scheduling observation evals.
 * The scheduler receives pre-fetched configs and creates job executions.
 */
export interface ObservationEvalSchedulerDeps {
  /** Create a job execution record in the database */
  createJobExecution: (params: {
    projectId: string;
    jobConfigurationId: string;
    jobInputTraceId: string;
    jobInputObservationId: string;
    status: string;
  }) => Promise<{ id: string }>;

  /** Check if a job execution already exists (for deduplication) */
  findExistingJobExecution: (params: {
    projectId: string;
    jobConfigurationId: string;
    jobInputObservationId: string;
  }) => Promise<{ id: string } | null>;

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
