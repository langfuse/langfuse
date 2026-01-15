import { type PrismaClient, type Prisma } from "@langfuse/shared/src/db";
import { type EventInput } from "../../../services/IngestionService";

/**
 * Re-export EventInput as the observation type for eval scheduling.
 * This type comes from processToEvent() and includes all trace-level
 * attributes (userId, sessionId, tags, release) needed for filtering.
 */
export type ObservationEvent = EventInput;

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
    data: unknown;
  }) => Promise<string>;

  /** Enqueue the eval job for execution */
  enqueueEvalJob: (params: {
    jobExecutionId: string;
    projectId: string;
    observationS3Path: string;
    delay: number;
  }) => Promise<void>;
}

/**
 * Dependencies for executing observation evals.
 * The executor downloads observation data, calls the LLM, and creates scores.
 */
export interface ObservationEvalExecutorDeps {
  prisma: PrismaClient;
  downloadFromS3: (params: { path: string }) => Promise<unknown>;
  callLLM: (params: {
    prompt: string;
    model: string;
    provider: string;
  }) => Promise<{ score: number; reasoning: string }>;
  createScore: (params: {
    id: string;
    projectId: string;
    traceId: string;
    observationId: string;
    name: string;
    value: number;
    comment: string;
    source: string;
  }) => Promise<void>;
}
