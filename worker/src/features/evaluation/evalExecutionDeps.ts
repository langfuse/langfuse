import { randomUUID } from "crypto";
import { z } from "zod";
import { JobExecutionStatus } from "@prisma/client";
import type { EvalExecutionContext } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  buildEventBucketPrefix,
  compileLangfuseMediaMessages,
  createLLMOutput,
  DefaultEvalModelService,
  generateLLMText,
  IngestionQueue,
  LLMAdapter,
  mapLegacyLLMCompletionParams,
  QueueJobs,
  ScoreEventType,
  UNKNOWN_INGESTION_SDK_VALUE,
  type ChatMessage,
} from "@langfuse/shared/src/server";
import { getEvalS3StorageClient } from "./s3StorageClient";
import { createInternalEventsWriter } from "../internal-tracing/createInternalEventsWriter";
import { recordExportVolume } from "../../services/exportVolumeMetric";

type StructuredOutputSchema = z.ZodObject<{
  reasoning: z.ZodString;
  score: z.ZodType;
}>;

const MODEL_FACING_OUTPUT_SCHEMA_DESCRIPTION =
  'Return only top-level "score" and "scoreExplanation". Put other requested fields inside "scoreExplanation".';

/**
 * Result of fetching model configuration.
 */
type ModelConfigResult =
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
interface LLMCallParams {
  messages: ChatMessage[];
  modelConfig: Extract<ModelConfigResult, { valid: true }>["config"];
  structuredOutputSchema: StructuredOutputSchema;
  traceSinkParams: {
    targetProjectId: string;
    traceId: string;
    traceName: string;
    environment: string;
    metadata: Record<string, unknown>;
    evaluationContext?: EvalExecutionContext;
  };
}

/**
 * Update data for job execution status.
 */
interface UpdateJobExecutionData {
  status: JobExecutionStatus;
  endTime?: Date;
  jobOutputScoreId?: string;
  executionTraceId?: string;
}

/**
 * Parameters for uploading a score to S3.
 */
interface UploadScoreParams {
  projectId: string;
  scoreId: string;
  eventId: string;
  event: ScoreEventType;
}

/**
 * Parameters for enqueueing score ingestion.
 */
interface EnqueueScoreIngestionParams {
  projectId: string;
  scoreId: string;
  eventId: string;
}

/**
 * Parameters for updating a job execution.
 */
interface UpdateJobExecutionParams {
  id: string;
  projectId: string;
  data: UpdateJobExecutionData;
}

/**
 * Parameters for fetching model configuration.
 */
interface FetchModelConfigParams {
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

// Measure the schema as the JSON Schema LangChain ships, not Zod's _def.
function serializeSchemaForEgress(schema: unknown): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema as z.ZodType));
  } catch {
    return JSON.stringify(schema);
  }
}

function serializeProviderMessagesForEgress(messages: unknown): string {
  return JSON.stringify(messages, (_key, value) =>
    value instanceof Uint8Array ? Buffer.from(value).toString("base64") : value,
  );
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
      const bucketPrefix = buildEventBucketPrefix({
        projectId: params.projectId,
        entityType: "score",
        entityId: params.scoreId,
      });
      const bucketPath = `${bucketPrefix}${params.eventId}.json`;

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

      const bucketPrefix = buildEventBucketPrefix({
        projectId: params.projectId,
        entityType: "score",
        entityId: params.scoreId,
      });

      await queue.add(QueueJobs.IngestionJob, {
        id: randomUUID(),
        timestamp: new Date(),
        name: QueueJobs.IngestionJob as const,
        payload: {
          data: {
            type: "score-create",
            eventBodyId: params.scoreId,
            fileKey: params.eventId,
            bucketPrefix,
            ingestionApiKey: "",
            ingestionSdkName: UNKNOWN_INGESTION_SDK_VALUE,
            ingestionSdkVersion: UNKNOWN_INGESTION_SDK_VALUE,
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
      // The dependency interface deliberately keeps the stored connection
      // shape small for testability. The boundary mapper owns conversion from
      // persisted Langfuse settings into the native AI SDK call contract.
      const connection = params.modelConfig.apiKey as unknown as Parameters<
        typeof mapLegacyLLMCompletionParams
      >[0]["connection"];

      const adapter = params.modelConfig.apiKey
        .adapter as unknown as Parameters<
        typeof mapLegacyLLMCompletionParams
      >[0]["modelParams"]["adapter"];

      const modelParams = {
        provider: params.modelConfig.provider,
        model: params.modelConfig.model,
        adapter,
        ...params.modelConfig.modelParams,
      };
      const llmParams = mapLegacyLLMCompletionParams({
        connection,
        messages: params.messages,
        modelParams,
      });
      const { providerMessages, traceMessages } =
        await compileLangfuseMediaMessages({
          projectId: params.traceSinkParams.targetProjectId,
          messages: params.messages,
          adapter,
        });

      // Keep the evaluator contract unchanged while the model-facing schema
      // resolves custom output instructions into the supported fields.
      const modelFacingStructuredOutputSchema = z
        .object({
          scoreExplanation: params.structuredOutputSchema.shape.reasoning,
          score: params.structuredOutputSchema.shape.score,
        })
        .describe(MODEL_FACING_OUTPUT_SCHEMA_DESCRIPTION);

      // llmaj egress: provider-bound messages (including base64-expanded inline
      // media) plus schema, uncompressed.
      const bytes =
        Buffer.byteLength(
          serializeProviderMessagesForEgress(providerMessages),
          "utf8",
        ) +
        Buffer.byteLength(
          serializeSchemaForEgress(modelFacingStructuredOutputSchema),
          "utf8",
        );

      const result = await generateLLMText({
        ...llmParams,
        messages: providerMessages,
        traceInput: traceMessages,
        output: createLLMOutput(modelFacingStructuredOutputSchema),
        maxRetries: 1,
        trace: {
          targetProjectId: params.traceSinkParams.targetProjectId,
          traceId: params.traceSinkParams.traceId,
          traceName: params.traceSinkParams.traceName,
          environment: params.traceSinkParams.environment,
          metadata: params.traceSinkParams.metadata,
          evaluationContext: params.traceSinkParams.evaluationContext,
          eventsWriter: createInternalEventsWriter(),
        },
      });

      // Record only after a successful send, like the other integrations.
      recordExportVolume({
        integration: "llmaj",
        bytes,
        projectId: params.traceSinkParams.targetProjectId,
      });

      return {
        score: result.output.score,
        reasoning: result.output.scoreExplanation,
      };
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
