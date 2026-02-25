import { randomUUID } from "crypto";
import { JobExecutionStatus } from "@prisma/client";
import { prisma } from "@langfuse/shared/src/db";
import {
  DefaultEvalModelService,
  fetchLLMCompletion,
  IngestionQueue,
  LLMAdapter,
  QueueJobs,
  ScoreEventType,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { buildEvalScoreSchema, buildEvalMessages } from "./evalExecutionUtils";
import { getEvalS3StorageClient } from "./s3StorageClient";

/**
 * Result of fetching model configuration.
 */
export type ModelConfigResult =
  | {
      valid: true;
      config: {
        provider: string;
        model: string;
        apiKey: {
          adapter: string;
          [key: string]: unknown;
        };
        adapter: LLMAdapter;
        modelParams: Record<string, unknown>;
      };
    }
  | {
      valid: false;
      error: string;
    };

/**
 * Parameters for calling the LLM.
 */
export interface LLMCallParams {
  messages: ReturnType<typeof buildEvalMessages>;
  modelConfig: Extract<ModelConfigResult, { valid: true }>["config"];
  structuredOutputSchema: ReturnType<typeof buildEvalScoreSchema>;
  traceSinkParams: {
    targetProjectId: string;
    traceId: string;
    traceName: string;
    environment: string;
    metadata: Record<string, unknown>;
  };
}

/**
 * Update data for job execution status.
 */
export interface UpdateJobExecutionData {
  status: JobExecutionStatus;
  endTime?: Date;
  jobOutputScoreId?: string;
  executionTraceId?: string;
}

/**
 * Parameters for uploading a score to S3.
 */
export interface UploadScoreParams {
  projectId: string;
  scoreId: string;
  eventId: string;
  event: ScoreEventType;
}

/**
 * Parameters for enqueueing score ingestion.
 */
export interface EnqueueScoreIngestionParams {
  projectId: string;
  scoreId: string;
  eventId: string;
}

/**
 * Parameters for updating a job execution.
 */
export interface UpdateJobExecutionParams {
  id: string;
  projectId: string;
  data: UpdateJobExecutionData;
}

/**
 * Parameters for fetching model configuration.
 */
export interface FetchModelConfigParams {
  projectId: string;
  provider?: string;
  model?: string;
  modelParams?: Record<string, unknown> | null;
}

/**
 * Dependency interface for eval execution.
 * This allows for easy mocking in tests while providing
 * a clear contract for all external dependencies.
 *
 * Note: Database fetching (job, config, template) is handled by callers,
 * not by the executor. This interface only covers operations needed
 * during LLM execution and score persistence.
 */
export interface EvalExecutionDeps {
  // Database operations (for status updates only)
  updateJobExecution: (params: UpdateJobExecutionParams) => Promise<void>;

  // Storage operations
  uploadScore: (params: UploadScoreParams) => Promise<void>;

  // Queue operations
  enqueueScoreIngestion: (params: EnqueueScoreIngestionParams) => Promise<void>;

  // LLM operations
  callLLM: (params: LLMCallParams) => Promise<unknown>;
  fetchModelConfig: (
    params: FetchModelConfigParams,
  ) => Promise<ModelConfigResult>;
}

/**
 * Creates the production implementation of eval execution dependencies.
 * This is the default implementation used in production code.
 */
export function createProductionEvalExecutionDeps(): EvalExecutionDeps {
  return {
    updateJobExecution: async ({ id, projectId, data }) => {
      await prisma.jobExecution.update({
        where: { id, projectId },
        data,
      });
    },

    uploadScore: async (params) => {
      const bucketPath = `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${params.projectId}/score/${params.scoreId}/${params.eventId}.json`;

      await getEvalS3StorageClient().uploadJson(bucketPath, [
        params.event as unknown as Record<string, unknown>,
      ]);
    },

    enqueueScoreIngestion: async (params) => {
      const shardingKey = `${params.projectId}-${params.scoreId}`;
      const queue = IngestionQueue.getInstance({ shardingKey });
      if (!queue) {
        throw new Error("Ingestion queue not available");
      }

      await queue.add(QueueJobs.IngestionJob, {
        id: randomUUID(),
        timestamp: new Date(),
        name: QueueJobs.IngestionJob as const,
        payload: {
          data: {
            type: "score-create",
            eventBodyId: params.scoreId,
            fileKey: params.eventId,
          },
          authCheck: {
            validKey: true,
            scope: {
              projectId: params.projectId,
            },
          },
        },
      });
    },

    callLLM: async (params) => {
      // Type assertion needed because the deps interface uses a simplified apiKey type for testability
      // while the actual fetchLLMCompletion requires a full LlmApiKey type
      const llmConnection = params.modelConfig.apiKey as unknown as Parameters<
        typeof fetchLLMCompletion
      >[0]["llmConnection"];

      const adapter = params.modelConfig.apiKey
        .adapter as unknown as Parameters<
        typeof fetchLLMCompletion
      >[0]["modelParams"]["adapter"];

      return fetchLLMCompletion({
        streaming: false,
        llmConnection,
        messages: params.messages,
        modelParams: {
          provider: params.modelConfig.provider,
          model: params.modelConfig.model,
          adapter,
          ...params.modelConfig.modelParams,
        },
        structuredOutputSchema: params.structuredOutputSchema,
        maxRetries: 1,
        traceSinkParams: {
          targetProjectId: params.traceSinkParams.targetProjectId,
          traceId: params.traceSinkParams.traceId,
          traceName: params.traceSinkParams.traceName,
          environment: params.traceSinkParams.environment,
          metadata: params.traceSinkParams.metadata,
        },
      });
    },

    fetchModelConfig: async ({ projectId, provider, model, modelParams }) => {
      const result = await DefaultEvalModelService.fetchValidModelConfig(
        projectId,
        provider,
        model,
        modelParams,
      );

      // Cast to our simplified ModelConfigResult type for the interface
      return result as ModelConfigResult;
    },
  };
}

/**
 * Creates a mock implementation of eval execution dependencies for testing.
 * All functions are no-ops or return null by default.
 * Override specific functions as needed in tests.
 */
export function createMockEvalExecutionDeps(
  overrides?: Partial<EvalExecutionDeps>,
): EvalExecutionDeps {
  const defaultMock: EvalExecutionDeps = {
    updateJobExecution: async () => {},
    uploadScore: async () => {},
    enqueueScoreIngestion: async () => {},
    callLLM: async () => ({ score: 0.5, reasoning: "Mock response" }),
    fetchModelConfig: async () => ({
      valid: false,
      error: "Mock - no config",
    }),
  };

  return { ...defaultMock, ...overrides };
}
