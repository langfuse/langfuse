import { DatasetStatus, Prisma } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  ApiAccessScope,
  ChatMessage,
  DatasetRunItemUpsertQueue,
  eventTypes,
  ExperimentCreateEventSchema,
  logger,
  processEventBatch,
  PROMPT_EXPERIMENT_ENVIRONMENT,
  queryClickhouse,
  QueueJobs,
  redis,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import z from "zod/v4";
import {
  parseDatasetItemInput,
  replaceVariablesInPrompt,
  validateAndSetupExperiment,
  validateDatasetItem,
} from "./utils";
import { backOff } from "exponential-backoff";
import { callLLM } from "../utils";
import { randomUUID } from "crypto";

const VALIDATION_ERROR_TRACE_ID = "validation-error-placeholder";

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

  /********************
   * INPUT VALIDATION *
   ********************/

  let experimentConfig;
  try {
    experimentConfig = await validateAndSetupExperiment(event);
  } catch (error) {
    logger.error("Failed to validate and setup experiment", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    // Create all dataset run items with the configuration error
    await createAllDatasetRunItemsWithConfigError(
      projectId,
      datasetId,
      runId,
      errorMessage,
    );
    return { success: true };
  }

  /********************
   * FETCH AND VALIDATE ALL DATASET ITEMS *
   ********************/

  const itemsToProcess = await getItemsToProcess(
    projectId,
    datasetId,
    runId,
    experimentConfig,
  );

  if (itemsToProcess.length === 0) {
    logger.info(`No new items to process for experiment ${runId}`);
    return { success: true };
  }

  /********************
   * PROCESS VALID ITEMS *
   ********************/

  logger.info(`Processing ${itemsToProcess.length} items`);

  for (let i = 0; i < itemsToProcess.length; i++) {
    const item = itemsToProcess[i];
    logger.info(
      `Processing item ${i + 1}/${itemsToProcess.length} (${item.id})`,
    );

    try {
      await processItem(projectId, item, experimentConfig);
    } catch (error) {
      logger.error(`Item ${i + 1} failed completely`, error);
    }
  }

  const duration = Date.now() - startTime;
  logger.info(
    `Experiment ${runId} completed in ${duration}ms. Processed: ${itemsToProcess.length}`,
  );

  return { success: true };
};

async function createAllDatasetRunItemsWithConfigError(
  projectId: string,
  datasetId: string,
  runId: string,
  errorMessage: string,
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
      id: "asc",
    },
  });

  // Check for existing run items to avoid duplicates
  const existingRunItems = await getExistingRunItems(
    projectId,
    runId,
    datasetId,
  );

  // Create run items with config error for all non-existing items
  const newItems = datasetItems.filter(
    (item) => !existingRunItems.has(item.id),
  );

  const errorRunItemEvents = newItems.map((datasetItem) => ({
    id: v4(),
    type: eventTypes.DATASET_RUN_ITEM_CREATE,
    timestamp: new Date().toISOString(),
    body: {
      id: v4(),
      traceId: VALIDATION_ERROR_TRACE_ID,
      observationId: null,
      error: `Experiment configuration error: ${errorMessage}`,
      input: datasetItem.input,
      expectedOutput: datasetItem.expectedOutput,
      createdAt: new Date().toISOString(),
      datasetId: datasetItem.datasetId,
      datasetRunId: runId,
      datasetItemId: datasetItem.id,
    },
  }));

  if (errorRunItemEvents.length > 0) {
    logger.info(
      `Creating ${errorRunItemEvents.length} dataset run items with config error`,
    );

    await processEventBatch(errorRunItemEvents, {
      validKey: true,
      scope: {
        projectId,
        accessLevel: "project" as const,
      } as ApiAccessScope,
      // TODO: fix
    });
  }
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
    logger.info(
      `No Dataset ${datasetId} item input matches expected prompt variable format`,
    );
    return [];
  }

  // Batch deduplication - get existing run items
  const existingRunItems = await getExistingRunItems(
    projectId,
    runId,
    datasetId,
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
  datasetId: string,
): Promise<Set<string>> {
  const query = `
    SELECT id
    FROM dataset_run_items
    WHERE project_id = {projectId: String}
    AND dataset_id = {datasetId: String}
    AND dataset_run_id = {runId: String}
  `;

  const rows = await queryClickhouse<{ id: string }>({
    query,
    params: {
      projectId,
      runId,
      datasetId,
    },
    tags: {
      feature: "dataset-run-item",
      type: "read",
      kind: "list",
      projectId,
    },
  });

  return new Set(rows.map((row) => row.id));
}

async function processItem(
  projectId: string,
  datasetItem: any,
  config: any,
): Promise<{ success: boolean }> {
  // Generate new trace ID for actual processing
  const newTraceId = v4();
  const runItemId = v4();

  const event = {
    id: v4(),
    type: eventTypes.DATASET_RUN_ITEM_CREATE,
    timestamp: new Date().toISOString(),
    body: {
      id: runItemId,
      traceId: newTraceId,
      observationId: null,
      error: null,
      input: datasetItem.input,
      expectedOutput: datasetItem.expectedOutput,
      createdAt: new Date().toISOString(),
      datasetId: datasetItem.datasetId,
      datasetRunId: config.runId,
      datasetItemId: datasetItem.id,
    },
  };

  const ingestionResult = await processEventBatch([event], {
    validKey: true,
    scope: {
      projectId: config.projectId,
      accessLevel: "project" as const,
    } as ApiAccessScope,
    // TODO: fix
  });

  if (ingestionResult.errors.length > 0) {
    const error = ingestionResult.errors[0];
    logger.error(
      `Failed to create run item for dataset item ${datasetItem.id}`,
      error,
    );
  }

  /********************
   * LLM MODEL CALL *
   ********************/

  const llmResult = await processLLMCall(
    runItemId,
    newTraceId,
    datasetItem,
    config,
  );

  if (!llmResult.success) return { success: false };

  /********************
   * ASYNC RUN ITEM EVAL *
   ********************/

  if (redis) {
    const queue = DatasetRunItemUpsertQueue.getInstance();
    if (queue) {
      await queue.add(QueueJobs.DatasetRunItemUpsert, {
        payload: {
          projectId,
          datasetItemId: datasetItem.id,
          traceId: newTraceId,
        },
        id: randomUUID(),
        timestamp: new Date(),
        name: QueueJobs.DatasetRunItemUpsert as const,
      });
    }
  }

  return { success: true };
}

async function processLLMCall(
  runItemId: string,
  traceId: string,
  datasetItem: any,
  config: any,
): Promise<{ success: boolean }> {
  let messages: ChatMessage[] = [];
  // Extract and replace variables in prompt
  try {
    messages = replaceVariablesInPrompt(
      config.validatedPrompt,
      datasetItem.input,
      config.allVariables,
      config.placeholderNames,
    );
  } catch (error) {
    logger.error(
      `Failed to replace variables in prompt for dataset item ${datasetItem.id}`,
      error,
    );
    return { success: false };
  }

  const traceParams = {
    environment: PROMPT_EXPERIMENT_ENVIRONMENT,
    traceName: `dataset-run-item-${runItemId.slice(0, 5)}`,
    traceId,
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

  return { success: true };
}
