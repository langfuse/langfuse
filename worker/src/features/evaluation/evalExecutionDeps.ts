import { randomUUID } from "crypto";
import { z } from "zod";
import { JobExecutionStatus } from "@prisma/client";
import type { EvalExecutionContext } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
import {
  buildEventBucketPrefix,
  createDecisionModelClient,
  decryptAndParseExtraHeaders,
  DefaultEvalModelService,
  generateLlmEvaluatorOutput,
  IngestionQueue,
  LLMAdapter,
  mapLegacyLLMCompletionParams,
  QueueJobs,
  ScoreEventType,
  UNKNOWN_INGESTION_SDK_VALUE,
  type ChatMessage,
  type DecisionModelEvaluation,
  type DecisionModelRequest,
  type InternalTraceWriter,
  writeInternalTraceViaOtelIngestion,
} from "@langfuse/shared/src/server";
import { UnrecoverableError } from "../../errors/UnrecoverableError";
import { getEvalScoreS3StorageClient } from "./s3StorageClient";
import { createInternalEventsWriter } from "../internal-tracing/createInternalEventsWriter";
import {
  callLLMViaBatch,
  createPrismaLlmBatchStore,
  isBatchInferenceEnabled,
  type RunWithTransport,
} from "../llm-batch";
import {
  llmRequestEgressBytes,
  recordExportVolume,
} from "../../services/exportVolumeMetric";

type StructuredOutputSchema = z.ZodObject<{
  reasoning: z.ZodString;
  score: z.ZodType;
}>;

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
  /** Keys a deferred batch call to its job execution. */
  jobExecutionId: string;
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
 * Parameters for asking a decision model one Choice question.
 */
interface DecisionModelCallParams {
  modelConfig: Extract<ModelConfigResult, { valid: true }>["config"];
  request: DecisionModelRequest;
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

  // Decision-model operations
  callDecisionModel: (
    params: DecisionModelCallParams,
  ) => Promise<DecisionModelEvaluation>;
  writeInternalTrace: InternalTraceWriter;
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

      await getEvalScoreS3StorageClient().uploadJson(bucketPath, [
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

      const run: RunWithTransport = async ({ transport, traced, metadata }) => {
        const result = await generateLlmEvaluatorOutput({
          projectId: params.traceSinkParams.targetProjectId,
          connection,
          modelParams: {
            provider: params.modelConfig.provider,
            model: params.modelConfig.model,
            adapter,
            ...params.modelConfig.modelParams,
          },
          messages: params.messages,
          outputResultSchema: params.structuredOutputSchema,
          transport,
          // A batch capture sends nothing, so it writes no execution trace.
          trace: traced
            ? {
                targetProjectId: params.traceSinkParams.targetProjectId,
                traceId: params.traceSinkParams.traceId,
                traceName: params.traceSinkParams.traceName,
                environment: params.traceSinkParams.environment,
                metadata: { ...params.traceSinkParams.metadata, ...metadata },
                evaluationContext: params.traceSinkParams.evaluationContext,
                eventsWriter: createInternalEventsWriter(),
              }
            : undefined,
        });

        if (traced) {
          // llmaj egress: provider-bound messages (including base64-expanded
          // inline media) plus schema, uncompressed. Recorded only after a
          // successful send (for batch: once the result is replayed), like
          // the other integrations.
          recordExportVolume({
            integration: "llmaj",
            bytes: llmRequestEgressBytes(
              result.providerMessages,
              result.modelFacingOutputSchema,
            ),
            projectId: params.traceSinkParams.targetProjectId,
          });
        }

        return result.output;
      };

      // Always through the batch path when the call has a job execution: a
      // call that already waits for a batch result must not run online, even
      // if batch inference was turned off or the model changed since.
      if (params.jobExecutionId) {
        return callLLMViaBatch({
          projectId: params.traceSinkParams.targetProjectId,
          jobExecutionId: params.jobExecutionId,
          llmApiKeyId: String(params.modelConfig.apiKey.id),
          model: params.modelConfig.model,
          batchEnabled: isBatchInferenceEnabled({
            adapter: params.modelConfig.apiKey.adapter,
            config: params.modelConfig.apiKey.config,
            model: params.modelConfig.model,
          }),
          run,
          store: createPrismaLlmBatchStore(),
        });
      }

      return run({ transport: undefined, traced: true });
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

    callDecisionModel: async (params) => {
      const { apiKey } = params.modelConfig;
      const secretKey = apiKey.secretKey;
      if (typeof secretKey !== "string") {
        throw new UnrecoverableError(
          "Decision-model connection is missing its secret key",
        );
      }

      let decryptedSecretKey: string;
      let extraHeaders: Record<string, string> | undefined;
      try {
        decryptedSecretKey = decrypt(secretKey);
        extraHeaders = decryptAndParseExtraHeaders(
          typeof apiKey.extraHeaders === "string" ? apiKey.extraHeaders : null,
        );
      } catch {
        throw new UnrecoverableError(
          "Decision-model connection secrets could not be decrypted",
        );
      }

      const client = createDecisionModelClient({
        adapter: apiKey.adapter,
        apiKey: decryptedSecretKey,
        model: params.modelConfig.model,
        baseURL: typeof apiKey.baseURL === "string" ? apiKey.baseURL : null,
        extraHeaders,
      });

      return client.evaluate(params.request);
    },

    writeInternalTrace: (trace) => writeInternalTraceViaOtelIngestion(trace),
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
    callDecisionModel: async ({ request }) => ({
      model: "mock-decision-model",
      answers: Object.fromEntries(
        Object.entries(request.questions).map(([id, question]) => {
          switch (question.type) {
            case "choice": {
              const choice = question.choices[0]?.value ?? "mock";
              return [
                id,
                {
                  type: "choice",
                  choice,
                  probabilities: { [choice]: 1 },
                  confidence: 1,
                },
              ];
            }
            case "score":
              return [
                id,
                { type: "score", score: 0, probabilities: {}, confidence: 1 },
              ];
            case "predicate":
              return [id, { type: "boolean", probability: 1 }];
          }
        }),
      ),
      usage: null,
    }),
    writeInternalTrace: async () => {},
  };

  return { ...defaultMock, ...overrides };
}
