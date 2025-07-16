import {
  DatasetStatus,
  extractPlaceholderNames,
  extractVariables,
  InvalidRequestError,
  LangfuseNotFoundError,
  Prisma,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  DatasetRunItemUpsertQueue,
  ExperimentCreateEventSchema,
  ExperimentMetadataSchema,
  LLMApiKeySchema,
  logger,
  PROMPT_EXPERIMENT_ENVIRONMENT,
  PromptContentSchema,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import z from "zod/v4";
import {
  fetchPrompt,
  parseDatasetItemInput,
  replaceVariablesInPrompt,
  validateDatasetItem,
} from "./utils";
import { backOff } from "exponential-backoff";
import { callLLM } from "../utils";
import { type PromptMessage } from "@langfuse/shared/src/server";

// Configuration
const EXPERIMENT_BATCH_SIZE = 100;

// Types
type BatchProcessingResult = {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  processed: number;
  failed: number;
  errors: string[];
};

type DatasetRunItemBatch = {
  id: string;
  projectId: string;
  datasetRunId: string;
  datasetItemId: string;
  traceId: string;
  observationId?: string;
  success: boolean;
  error?: string;
};

// Utility functions
function chunkArray<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size),
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const createExperimentJobClickhouse = async ({
  event,
}: {
  event: z.infer<typeof ExperimentCreateEventSchema>;
}) => {
  const startTime = Date.now();
  logger.info(
    "Processing experiment create job with ClickHouse batching",
    event,
  );

  const { datasetId, projectId, runId } = event;

  try {
    // Phase 1: Validation and Setup (same as original)
    const experimentConfig = await validateAndSetupExperiment(event);

    // Phase 2: Batch Deduplication
    const itemsToProcess = await getItemsToProcess(
      projectId,
      datasetId,
      runId,
      experimentConfig,
    );

    if (itemsToProcess.length === 0) {
      logger.info(`No new items to process for experiment ${runId}`);
      return { success: true, processed: 0, batches: 0 };
    }

    // Phase 3: Batch Processing
    const batches = chunkArray(itemsToProcess, EXPERIMENT_BATCH_SIZE);
    logger.info(
      `Processing ${itemsToProcess.length} items in ${batches.length} batches of ${EXPERIMENT_BATCH_SIZE}`,
    );

    let totalProcessed = 0;
    let totalFailed = 0;
    const batchResults: BatchProcessingResult[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logger.info(
        `Processing batch ${i + 1}/${batches.length} (${batch.length} items)`,
      );

      try {
        const result = await processBatch(
          batch,
          experimentConfig,
          `${runId}-${i}`,
        );
        batchResults.push(result);
        totalProcessed += result.processed;
        totalFailed += result.failed;

        // Small delay between batches to prevent overwhelming downstream systems
        if (i < batches.length - 1) {
          await sleep(100);
        }
      } catch (error) {
        logger.error(`Batch ${i + 1} failed completely`, error);
        batchResults.push({
          status: "FAILED",
          processed: 0,
          failed: batch.length,
          errors: [error instanceof Error ? error.message : "Unknown error"],
        });
        totalFailed += batch.length;
      }
    }

    const duration = Date.now() - startTime;
    logger.info(
      `Experiment ${runId} completed in ${duration}ms. Processed: ${totalProcessed}, Failed: ${totalFailed}`,
    );

    return {
      success: totalProcessed > 0,
      processed: totalProcessed,
      failed: totalFailed,
      batches: batches.length,
      duration,
      batchResults,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Experiment ${runId} failed after ${duration}ms`, error);
    throw error;
  }
};

async function validateAndSetupExperiment(
  event: z.infer<typeof ExperimentCreateEventSchema>,
) {
  const { datasetId, projectId, runId } = event;

  // Validate dataset run exists
  const datasetRun = await prisma.datasetRuns.findUnique({
    where: {
      id_projectId: { id: runId, projectId },
    },
  });

  if (!datasetRun) {
    throw new LangfuseNotFoundError(`Dataset run ${runId} not found`);
  }

  // Validate experiment metadata
  const validatedRunMetadata = ExperimentMetadataSchema.safeParse(
    datasetRun.metadata,
  );
  if (!validatedRunMetadata.success) {
    throw new InvalidRequestError(
      "Langfuse in-app experiments can only be run with prompt and model configurations in metadata.",
    );
  }

  const { prompt_id, provider, model, model_params } =
    validatedRunMetadata.data;

  // Fetch and validate prompt
  const prompt = await fetchPrompt(prompt_id, projectId);
  if (!prompt) {
    throw new LangfuseNotFoundError(`Prompt ${prompt_id} not found`);
  }

  const validatedPrompt = PromptContentSchema.safeParse(prompt.prompt);
  if (!validatedPrompt.success) {
    throw new InvalidRequestError(
      `Prompt ${prompt_id} not found in expected format`,
    );
  }

  // Fetch and validate API key
  const apiKey = await prisma.llmApiKeys.findFirst({
    where: { projectId, provider },
  });
  if (!apiKey) {
    throw new LangfuseNotFoundError(
      `API key for provider ${provider} not found`,
    );
  }

  const validatedApiKey = LLMApiKeySchema.safeParse(apiKey);
  if (!validatedApiKey.success) {
    throw new InvalidRequestError(
      `API key for provider ${provider} not found.`,
    );
  }

  // Extract variables from prompt
  const extractedVariables = extractVariables(
    prompt?.type === "text"
      ? (prompt.prompt?.toString() ?? "")
      : JSON.stringify(prompt.prompt),
  );

  const placeholderNames =
    prompt?.type !== "text" && Array.isArray(validatedPrompt.data)
      ? extractPlaceholderNames(validatedPrompt.data as PromptMessage[])
      : [];

  const allVariables = [...extractedVariables, ...placeholderNames];

  return {
    datasetRun,
    prompt,
    validatedPrompt: validatedPrompt.data,
    validatedApiKey: validatedApiKey.data,
    provider,
    model,
    model_params,
    allVariables,
    projectId,
    datasetId,
    runId,
  };
}

async function getItemsToProcess(
  projectId: string,
  datasetId: string,
  runId: string,
  config: any,
) {
  // Fetch all dataset items
  const datasetItems = await prisma.datasetItem.findMany({
    where: {
      datasetId,
      projectId,
      status: DatasetStatus.ACTIVE,
    },
    orderBy: {
      createdAt: "desc",
      id: "asc", // createdAt is not deterministic
    },
  });

  // Filter and validate dataset items
  const validatedDatasetItems = datasetItems
    .filter(({ input }) => validateDatasetItem(input, config.allVariables))
    .map((datasetItem) => ({
      ...datasetItem,
      input: parseDatasetItemInput(
        datasetItem.input as Prisma.JsonObject,
        config.allVariables,
      ),
    }));

  if (!validatedDatasetItems.length) {
    throw new InvalidRequestError(
      `No Dataset ${datasetId} item input matches expected prompt variable format`,
    );
  }

  // Batch deduplication - get existing run items
  const existingRunItems = await getExistingRunItems(
    projectId,
    runId,
    validatedDatasetItems.map((item) => item.id),
  );

  // Filter out existing items
  const itemsToProcess = validatedDatasetItems.filter(
    (item) => !existingRunItems.has(item.id),
  );

  logger.info(
    `Found ${validatedDatasetItems.length} valid items, ${existingRunItems.size} already exist, ${itemsToProcess.length} to process`,
  );

  return itemsToProcess;
}

async function getExistingRunItems(
  projectId: string,
  runId: string,
  itemIds: string[],
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();

  // TODO: Clickhouse read for existing run items
  const existingItems: { dataset_item_id: string }[] = [];

  return new Set(existingItems.map((item) => item.dataset_item_id));
}

async function processBatch(
  datasetItems: any[],
  config: any,
  batchId: string,
): Promise<BatchProcessingResult> {
  const runItems: DatasetRunItemBatch[] = [];
  const errors: string[] = [];

  try {
    // Phase 1: Populate run item batch with core fields
    for (const datasetItem of datasetItems) {
      try {
        const newTraceId = v4();
        const runItemId = v4();

        runItems.push({
          id: runItemId,
          projectId: config.projectId,
          datasetRunId: config.runId,
          datasetItemId: datasetItem.id,
          traceId: newTraceId,
          success: false, // Will be updated after LLM call
        });
      } catch (error) {
        logger.error(
          `Failed to create run item for dataset item ${datasetItem.id}`,
          error,
        );
        errors.push(
          `Create run item failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    // Phase 2: Process LLM calls in parallel within batch
    const llmResults = await Promise.allSettled(
      runItems.map((runItem, index) =>
        processLLMCall(runItem, datasetItems[index], config),
      ),
    );

    // Update success status based on LLM results
    llmResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        runItems[index].success = true;
      } else {
        runItems[index].success = false;
        runItems[index].error =
          result.reason instanceof Error
            ? result.reason.message
            : "LLM call failed";
        errors.push(
          `LLM call failed for item ${runItems[index].datasetItemId}: ${runItems[index].error}`,
        );
      }
    });

    // Phase 3: Ingest batch to Langfuse ingestion service
    const successfulItems = runItems.filter((item) => item.success);
    if (successfulItems.length > 0) {
      // TODO: Implement
    }

    // Phase 4: Queue evaluations for successful items
    if (redis && successfulItems.length > 0) {
      await queueEvaluationsBatch(successfulItems, config);
    }

    const processed = successfulItems.length;
    const failed = runItems.length - processed;

    return {
      status: failed === 0 ? "SUCCESS" : processed > 0 ? "PARTIAL" : "FAILED",
      processed,
      failed,
      errors,
    };
  } catch (error) {
    logger.error(`Batch ${batchId} processing failed`, error);
    return {
      status: "FAILED",
      processed: 0,
      failed: datasetItems.length,
      errors: [error instanceof Error ? error.message : "Unknown batch error"],
    };
  }
}

async function processLLMCall(
  runItem: DatasetRunItemBatch,
  datasetItem: any,
  config: any,
): Promise<void> {
  // Extract and replace variables in prompt
  const messages = replaceVariablesInPrompt(
    config.validatedPrompt,
    datasetItem.input,
    config.allVariables,
  );

  const traceParams = {
    environment: PROMPT_EXPERIMENT_ENVIRONMENT,
    traceName: `dataset-run-item-${runItem.id.slice(0, 5)}`,
    traceId: runItem.traceId,
    projectId: config.projectId,
    authCheck: {
      validKey: true as const,
      scope: {
        projectId: config.projectId,
        accessLevel: "project",
      } as any,
    },
  };

  await backOff(
    async () =>
      await callLLM(
        config.validatedApiKey,
        messages,
        config.model_params,
        config.provider,
        config.model,
        traceParams,
      ),
    {
      numOfAttempts: 1, // Turn off retries as Langchain handles this
    },
  );
}

async function queueEvaluationsBatch(
  runItems: DatasetRunItemBatch[],
  config: any,
): Promise<void> {
  const queue = DatasetRunItemUpsertQueue.getInstance();
  if (!queue) return;

  const queuePromises = runItems.map((runItem) =>
    queue.add(QueueJobs.DatasetRunItemUpsert, {
      payload: {
        projectId: config.projectId,
        datasetItemId: runItem.datasetItemId,
        traceId: runItem.traceId,
      },
      id: v4(),
      timestamp: new Date(),
      name: QueueJobs.DatasetRunItemUpsert as const,
    }),
  );

  await Promise.allSettled(queuePromises);
  logger.info(`Queued ${queuePromises.length} evaluation jobs`);
}
