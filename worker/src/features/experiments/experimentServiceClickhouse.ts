import { DatasetStatus, Prisma } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  ChatMessage,
  DatasetRunItemUpsertQueue,
  eventTypes,
  ExperimentCreateEventSchema,
  IngestionEventType,
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
  generateUnifiedTraceId,
  parseDatasetItemInput,
  replaceVariablesInPrompt,
  shouldCreateTrace,
  TraceExecutionSource,
  validateAndSetupExperiment,
  validateDatasetItem,
} from "./utils";
import { backOff } from "exponential-backoff";
import { callLLM } from "../utils";
import { randomUUID } from "crypto";

async function getExistingRunItemDatasetItemIds(
  projectId: string,
  runId: string,
  datasetId: string,
): Promise<Set<string>> {
  const query = `
  SELECT dataset_item_id as id
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
  // Use unified trace ID to avoid creating duplicate traces between PostgreSQL and ClickHouse
  const newTraceId = generateUnifiedTraceId(config.runId, datasetItem.id);
  const runItemId = v4();
  const timestamp = new Date().toISOString();

  const event = {
    id: runItemId,
    type: eventTypes.DATASET_RUN_ITEM_CREATE,
    timestamp,
    body: {
      id: runItemId,
      traceId: newTraceId,
      observationId: null,
      error: null,
      input: datasetItem.input,
      expectedOutput: datasetItem.expectedOutput,
      createdAt: timestamp,
      datasetId: datasetItem.datasetId,
      runId: config.runId,
      datasetItemId: datasetItem.id,
    },
  };

  const ingestionResult = await processEventBatch(
    [event],
    {
      validKey: true,
      scope: {
        projectId: config.projectId,
        accessLevel: "project" as const,
      },
    },
    {
      isLangfuseInternal: true,
    },
  );

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

  if (shouldCreateTrace(TraceExecutionSource.CLICKHOUSE)) {
    const llmResult = await processLLMCall(
      runItemId,
      newTraceId,
      datasetItem,
      config,
    );

    if (!llmResult.success) return { success: false };
  }

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
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
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

  // Batch deduplication - get existing run items' dataset item ids
  const existingDatasetItemIds = await getExistingRunItemDatasetItemIds(
    projectId,
    runId,
    datasetId,
  );

  // Filter out existing items
  const itemsToProcess = validatedDatasetItems.filter(
    (item) => !existingDatasetItemIds.has(item.id),
  );

  logger.info(
    `Found ${validatedDatasetItems.length} valid items, ${existingDatasetItemIds.size} already exist, ${itemsToProcess.length} to process`,
  );

  return itemsToProcess;
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

// In error cases (config errors), we always create traces in ClickHouse execution path since PostgreSQL execution
// simply updates dataset run metadata and has never created error-level traces. This is new behavior we have introduced.
// We accept this inconsistency in writes until the DRI migration had been completed.
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
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });

  // Check for existing run items' dataset item ids to avoid duplicates
  const existingRunItemDatasetItemIds = await getExistingRunItemDatasetItemIds(
    projectId,
    runId,
    datasetId,
  );

  // Create run items with config error for all non-existing items
  const newItems = datasetItems.filter(
    (item) => !existingRunItemDatasetItemIds.has(item.id),
  );

  const events: IngestionEventType[] = newItems.flatMap((datasetItem) => {
    const traceId = v4();
    const runItemId = v4();
    const generationId = v4();
    const timestamp = new Date().toISOString();

    let stringInput = "";
    try {
      stringInput = JSON.stringify(datasetItem.input);
    } catch (error) {
      logger.info(
        `Failed to stringify input for dataset item ${datasetItem.id}`,
      );
    }

    return [
      // dataset run item
      {
        id: runItemId,
        type: eventTypes.DATASET_RUN_ITEM_CREATE,
        timestamp,
        body: {
          id: runItemId,
          traceId,
          observationId: null,
          error: `Experiment configuration error: ${errorMessage}`,
          createdAt: timestamp,
          datasetId: datasetItem.datasetId,
          runId: runId,
          datasetItemId: datasetItem.id,
        },
      },
      // trace
      {
        id: traceId,
        type: eventTypes.TRACE_CREATE,
        timestamp,
        body: {
          id: traceId,
          environment: PROMPT_EXPERIMENT_ENVIRONMENT,
          name: `dataset-run-item-${runItemId.slice(0, 5)}`,
          input: stringInput,
        },
      },
      // generation
      {
        id: generationId,
        type: eventTypes.GENERATION_CREATE,
        timestamp,
        body: {
          id: generationId,
          environment: PROMPT_EXPERIMENT_ENVIRONMENT,
          traceId,
          input: stringInput,
          level: "ERROR" as const,
          statusMessage: `Experiment configuration error: ${errorMessage}`,
        },
      },
    ];
  });

  if (events.length > 0) {
    logger.info(
      `Creating ${events.length / 3} dataset run items with config error`,
    );

    await processEventBatch(
      events,
      {
        validKey: true,
        scope: {
          projectId,
          accessLevel: "project" as const,
        },
      },
      { isLangfuseInternal: true },
    );
  }
}
