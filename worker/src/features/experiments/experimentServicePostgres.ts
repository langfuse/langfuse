import { z } from "zod/v4";
import {
  LLMApiKeySchema,
  logger,
  ExperimentMetadataSchema,
  PromptContentSchema,
  DatasetRunItemUpsertQueue,
  type ChatMessage,
  PROMPT_EXPERIMENT_ENVIRONMENT,
  TraceParams,
  extractPlaceholderNames,
  type PromptMessage,
} from "@langfuse/shared/src/server";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import { type ExperimentCreateEventSchema } from "@langfuse/shared/src/server";
import {
  extractVariables,
  InvalidRequestError,
  LangfuseNotFoundError,
  type Prisma,
  PromptType,
  QUEUE_ERROR_MESSAGES,
} from "@langfuse/shared";
import { backOff } from "exponential-backoff";
import { callLLM } from "../../features/utils";
import { QueueJobs, redis } from "@langfuse/shared/src/server";
import { randomUUID } from "node:crypto";
import { v4 } from "uuid";
import { DatasetStatus } from "../../../../packages/shared/dist/prisma/generated/types";
import {
  fetchDatasetRun,
  fetchPrompt,
  parseDatasetItemInput,
  replaceVariablesInPrompt,
  validateDatasetItem,
} from "./utils";

export const createExperimentJobPostgres = async ({
  event,
}: {
  event: z.infer<typeof ExperimentCreateEventSchema>;
}) => {
  logger.info("Processing experiment create job", event);
  const { datasetId, projectId, runId } = event;

  /********************
   * INPUT VALIDATION *
   ********************/

  const datasetRun = await fetchDatasetRun(runId, projectId);
  if (!datasetRun) {
    throw new LangfuseNotFoundError(`Dataset run ${runId} not found`);
  }

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

  // fetch and validate API key
  const apiKey = await prisma.llmApiKeys.findFirst({
    where: {
      projectId: event.projectId,
      provider,
    },
  });
  if (!apiKey) {
    throw new LangfuseNotFoundError(
      `${QUEUE_ERROR_MESSAGES.API_KEY_ERROR} ${provider} not found`,
    );
  }
  const validatedApiKey = LLMApiKeySchema.safeParse(apiKey);
  if (!validatedApiKey.success) {
    throw new InvalidRequestError(
      `${QUEUE_ERROR_MESSAGES.API_KEY_ERROR} ${provider} not found.`,
    );
  }

  // fetch dataset items
  const datasetItems = await prisma.datasetItem.findMany({
    where: {
      datasetId,
      projectId,
      status: DatasetStatus.ACTIVE,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // extract variables from prompt
  const extractedVariables = extractVariables(
    prompt?.type === PromptType.Text
      ? (prompt.prompt?.toString() ?? "")
      : JSON.stringify(prompt.prompt),
  );

  // also extract placeholder names if prompt is a chat prompt
  const placeholderNames =
    prompt?.type === PromptType.Chat && Array.isArray(validatedPrompt.data)
      ? extractPlaceholderNames(validatedPrompt.data as PromptMessage[])
      : [];
  const allVariables = [...extractedVariables, ...placeholderNames];

  // validate dataset items against prompt configuration
  const validatedDatasetItems = datasetItems
    .filter(({ input }) => validateDatasetItem(input, allVariables))
    .map((datasetItem) => ({
      ...datasetItem,
      input: parseDatasetItemInput(
        datasetItem.input as Prisma.JsonObject, // this is safe because we already filtered for valid input
        allVariables,
      ),
    }));

  logger.info(
    `Found ${validatedDatasetItems.length} validated dataset items for dataset run ${runId}`,
  );

  if (!validatedDatasetItems.length) {
    throw new InvalidRequestError(
      `No Dataset ${datasetId} item input matches expected prompt variables or placeholders format`,
    );
  }

  for (const datasetItem of validatedDatasetItems) {
    // dedupe and skip if dataset run item already exists
    const existingRunItem = await kyselyPrisma.$kysely
      .selectFrom("dataset_run_items")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("dataset_item_id", "=", datasetItem.id)
      .where("dataset_run_id", "=", runId)
      .executeTakeFirst();

    if (existingRunItem) {
      logger.info(
        `Dataset run item ${existingRunItem.id} already exists, skipping`,
      );
      continue;
    }

    /********************
     * VARIABLE EXTRACTION *
     ********************/

    let messages: ChatMessage[] = [];
    try {
      messages = replaceVariablesInPrompt(
        validatedPrompt.data,
        datasetItem.input, // validated format
        allVariables,
        placeholderNames,
      );
    } catch (error) {
      // skip this dataset item if there is an error replacing variables
      logger.error(
        `Error replacing variables in prompt for dataset item ${datasetItem.id}`,
        error,
      );
      continue;
    }

    /********************
     * RUN ITEM CREATION *
     ********************/

    const newTraceId = v4();

    const runItem = await prisma.datasetRunItems.create({
      data: {
        datasetItemId: datasetItem.id,
        traceId: newTraceId,
        datasetRunId: runId,
        projectId,
      },
    });

    /********************
     * LLM MODEL CALL *
     ********************/

    const traceParams: Omit<TraceParams, "tokenCountDelegate"> = {
      environment: PROMPT_EXPERIMENT_ENVIRONMENT,
      traceName: `dataset-run-item-${runItem.id.slice(0, 5)}`,
      traceId: newTraceId,
      projectId: event.projectId,
      authCheck: {
        validKey: true as const,
        scope: {
          projectId: event.projectId,
          accessLevel: "project",
        } as any,
      },
    };

    await backOff(
      async () =>
        await callLLM(
          validatedApiKey.data,
          messages,
          model_params,
          provider,
          model,
          traceParams,
        ),
      {
        numOfAttempts: 1, // turn off retries as Langchain is doing that for us already.
      },
    );

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
  }
};
