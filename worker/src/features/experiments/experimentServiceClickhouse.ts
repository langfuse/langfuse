import {
  asRecord,
  convertEventRecordToObservationForEval,
  DatasetItemDomain,
  Prisma,
} from "@langfuse/shared";
import {
  ChatMessage,
  convertDateToClickhouseDateTime,
  createLLMOutput,
  createLLMToolSet,
  createUnknownSdkIngestionAttribution,
  createDatasetItemFilterState,
  DatasetRunItemUpsertQueue,
  eventTypes,
  ExperimentCreateEventSchema,
  generateLLMText,
  getDatasetItems,
  IngestionEventType,
  LangfuseInternalTraceEnvironment,
  logger,
  mapLegacyLLMCompletionParams,
  processEventBatch,
  queryClickhouse,
  QueueJobs,
  redis,
  TraceSinkParams,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import z from "zod";
import {
  parseDatasetItemInput,
  replaceVariablesInPrompt,
  validateAndSetupExperiment,
  type PromptExperimentConfig,
} from "./utils";
import {
  validateDatasetItem,
  normalizeDatasetItemInput,
} from "@langfuse/shared";
import { randomUUID } from "crypto";
import { createW3CTraceId } from "../utils";
import { scheduleExperimentObservationEvals } from "./scheduleExperimentEvals";
import { createInternalEventsWriter } from "../internal-tracing/createInternalEventsWriter";

// Number of dataset items fetched per `getDatasetItems` call. Keeps a single
// query bounded instead of loading an entire (potentially huge) dataset with
// full input/output payloads into memory in one shot. Exported for tests.
export const DATASET_ITEMS_PAGE_SIZE = 500;

async function getExistingRunItemDatasetItemIds(
  projectId: string,
  runId: string,
  datasetId: string,
): Promise<Set<string>> {
  const query = `
  SELECT dataset_item_id as id
  FROM dataset_run_items_rmt
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
    tags: { projectId },
  });

  return new Set(rows.map((row) => row.id));
}

async function processItem(
  projectId: string,
  datasetItem: DatasetItemDomain & { input: Prisma.JsonObject },
  config: PromptExperimentConfig,
): Promise<{ success: boolean }> {
  // Use unified trace ID to avoid creating duplicate traces between PostgreSQL and ClickHouse
  const newTraceId = createW3CTraceId(`${config.runId}-${datasetItem.id}`);
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
      createdAt: timestamp,
      datasetId: datasetItem.datasetId,
      runId: config.runId,
      datasetItemId: datasetItem.id,
      datasetVersion: datasetItem.validFrom.toISOString(),
    },
  };

  const auth = {
    validKey: true as const,
    scope: {
      projectId: config.projectId,
      accessLevel: "project" as const,
    },
  };

  const ingestionResult = await processEventBatch([event], auth, {
    isLangfuseInternal: true,
    attribution: createUnknownSdkIngestionAttribution({ authCheck: auth }),
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
          datasetItemValidFrom: datasetItem.validFrom,
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
  datasetItem: DatasetItemDomain & { input: Prisma.JsonObject },
  config: PromptExperimentConfig,
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
  const traceSinkParams: TraceSinkParams = {
    environment: LangfuseInternalTraceEnvironment.PromptExperiments,
    traceName: `dataset-run-item-${runItemId.slice(0, 5)}`,
    traceId,
    targetProjectId: config.projectId, // ingest to user project
    metadata: {
      dataset_id: datasetItem.datasetId,
      dataset_item_id: datasetItem.id,
      structured_output_schema: config.structuredOutputSchema,
      experiment_name: config.experimentName,
      experiment_run_name: config.experimentRunName,
    },
    prompt: config.prompt,
    eventsWriter: createInternalEventsWriter({
      experimentContext: {
        id: config.runId,
        name: config.datasetRun.name,
        metadata: asRecord(config.datasetRun.metadata),
        description: config.datasetRun.description,
        datasetId: datasetItem.datasetId,
        itemId: datasetItem.id,
        itemVersion: convertDateToClickhouseDateTime(datasetItem.validFrom),
        itemExpectedOutput: datasetItem.expectedOutput,
        itemMetadata: asRecord(datasetItem.metadata),
      },
      onRootEventRecordReady: async (rootEventRecord) => {
        await scheduleExperimentObservationEvals({
          observation: convertEventRecordToObservationForEval(rootEventRecord),
        });
      },
    }),
  };

  const llmParams = mapLegacyLLMCompletionParams({
    connection: config.validatedApiKey,
    messages,
    modelParams: {
      provider: config.provider,
      model: config.model,
      adapter: config.validatedApiKey.adapter,
      ...config.model_params,
    },
  });

  await generateLLMText({
    ...llmParams,
    maxRetries: 1,
    // Setup rejects the unsupported tools + structured-output combination.
    ...(config.structuredOutputSchema
      ? { output: createLLMOutput(config.structuredOutputSchema) }
      : config.tools.length > 0
        ? { tools: createLLMToolSet(config.tools) }
        : {}),
    trace: traceSinkParams,
  }).catch(() => undefined); // catch errors and do not retry

  return { success: true };
}

async function getItemsToProcess(
  projectId: string,
  datasetId: string,
  runId: string,
  config: PromptExperimentConfig,
) {
  // Batch deduplication - get existing run items' dataset item ids upfront so
  // we can filter each page as it is fetched instead of holding the entire
  // dataset (including all unprocessed items) in memory at once.
  const existingDatasetItemIds = await getExistingRunItemDatasetItemIds(
    projectId,
    runId,
    datasetId,
  );

  const filterState = createDatasetItemFilterState({
    datasetIds: [datasetId],
    status: "ACTIVE",
  });

  let validatedCount = 0;
  const itemsToProcess: Array<
    DatasetItemDomain & { input: Prisma.JsonObject }
  > = [];

  // Page through the dataset instead of fetching every item (with full IO)
  // in a single unbounded query.
  for (let page = 0; ; page++) {
    const datasetItemsPage = await getDatasetItems({
      projectId,
      filterState,
      version: config.datasetVersion,
      includeIO: true,
      limit: DATASET_ITEMS_PAGE_SIZE,
      page,
    });

    if (datasetItemsPage.length === 0) break;

    // Filter and validate dataset items
    const validatedPageItems = datasetItemsPage
      .filter(({ input }) => validateDatasetItem(input, config.allVariables))
      .map((datasetItem) => {
        // Normalize string inputs to object format for single-variable prompts
        const normalizedInput = normalizeDatasetItemInput(
          datasetItem.input,
          config.allVariables,
        );

        return {
          ...datasetItem,
          status: datasetItem.status ?? "ACTIVE",
          input: parseDatasetItemInput(normalizedInput, config.allVariables),
        };
      });

    validatedCount += validatedPageItems.length;

    for (const item of validatedPageItems) {
      if (!existingDatasetItemIds.has(item.id)) {
        itemsToProcess.push(item);
      }
    }

    if (datasetItemsPage.length < DATASET_ITEMS_PAGE_SIZE) break;
  }

  if (!validatedCount) {
    logger.info(
      `No Dataset ${datasetId} item input matches expected prompt variable format`,
    );
    return [];
  }

  logger.info(
    `Found ${validatedCount} valid items, ${existingDatasetItemIds.size} already exist, ${itemsToProcess.length} to process`,
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

  let experimentConfig: PromptExperimentConfig;
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
  // Check for existing run items' dataset item ids to avoid duplicates
  const existingRunItemDatasetItemIds = await getExistingRunItemDatasetItemIds(
    projectId,
    runId,
    datasetId,
  );

  const filterState = createDatasetItemFilterState({
    datasetIds: [datasetId],
    status: "ACTIVE",
  });

  const auth = {
    validKey: true as const,
    scope: {
      projectId,
      accessLevel: "project" as const,
    },
  };

  let totalCreated = 0;

  // Page through the dataset and submit one bounded-size ingestion batch per
  // page instead of loading every item into memory and submitting a single
  // unchunked events array.
  for (let page = 0; ; page++) {
    const datasetItemsPage = await getDatasetItems({
      projectId,
      filterState,
      includeIO: true,
      limit: DATASET_ITEMS_PAGE_SIZE,
      page,
    });

    if (datasetItemsPage.length === 0) break;

    // Create run items with config error for all non-existing items
    const newItems = datasetItemsPage.filter(
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
      } catch {
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
            datasetVersion: datasetItem.validFrom.toISOString(),
          },
        },
        // trace
        {
          id: traceId,
          type: eventTypes.TRACE_CREATE,
          timestamp,
          body: {
            id: traceId,
            environment: LangfuseInternalTraceEnvironment.PromptExperiments,
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
            environment: LangfuseInternalTraceEnvironment.PromptExperiments,
            traceId,
            input: stringInput,
            level: "ERROR" as const,
            statusMessage: `Experiment configuration error: ${errorMessage}`,
          },
        },
      ];
    });

    if (events.length > 0) {
      await processEventBatch(events, auth, {
        isLangfuseInternal: true,
        attribution: createUnknownSdkIngestionAttribution({ authCheck: auth }),
      });
      totalCreated += newItems.length;
    }

    if (datasetItemsPage.length < DATASET_ITEMS_PAGE_SIZE) break;
  }

  if (totalCreated > 0) {
    logger.info(
      `Created ${totalCreated} dataset run items with config error`,
    );
  }
}
