import { z } from "zod";
import {
  ChatMessageRole,
  LLMApiKeySchema,
  logger,
  PromptContent,
  ExperimentMetadataSchema,
  PromptContentSchema,
  DatasetRunItemUpsertQueue,
} from "@langfuse/shared/src/server";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import { ExperimentCreateEventSchema } from "@langfuse/shared/src/server";
import {
  ForbiddenError,
  InvalidRequestError,
  LangfuseNotFoundError,
  Prisma,
  extractVariables,
  datasetItemMatchesVariable,
  stringifyValue,
  ExperimentError,
  ApiError,
} from "@langfuse/shared";
import { backOff } from "exponential-backoff";
import { callLLM } from "../../features/utilities";
import { QueueJobs, redis } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { v4 } from "uuid";
import { compileHandlebarString } from "../../features/utilities";
import { DatasetStatus } from "../../../../packages/shared/dist/prisma/generated/types";

const isValidPrismaJsonObject = (
  input: Prisma.JsonValue,
): input is Prisma.JsonObject =>
  typeof input === "object" &&
  input !== null &&
  input !== undefined &&
  !Array.isArray(input);

const replaceVariablesInPrompt = (
  prompt: PromptContent,
  itemInput: Record<string, any>,
  variables: string[],
): { role: string; content: string }[] => {
  const processContent = (content: string) => {
    // Only include the variables that are in the variables array
    const filteredContext = Object.fromEntries(
      Object.entries(itemInput).filter(([key]) => variables.includes(key)),
    );

    return compileHandlebarString(content, filteredContext);
  };

  if (typeof prompt === "string") {
    return [{ role: ChatMessageRole.System, content: processContent(prompt) }];
  } else {
    return prompt.map((message) => ({
      ...message,
      content: processContent(message.content),
    }));
  }
};

const validateDatasetItem = (
  itemInput: Prisma.JsonValue,
  variables: string[],
): itemInput is Prisma.JsonObject => {
  if (!isValidPrismaJsonObject(itemInput)) {
    return false;
  }
  return variables.some((variable) =>
    datasetItemMatchesVariable(itemInput, variable),
  );
};

const parseDatasetItemInput = (
  itemInput: Prisma.JsonObject,
  variables: string[],
): Prisma.JsonObject => {
  try {
    const filteredInput = Object.fromEntries(
      Object.entries(itemInput)
        .filter(([key]) => variables.includes(key))
        .map(([key, value]) => [
          key,
          value === null ? null : stringifyValue(value),
        ]),
    );
    return filteredInput;
  } catch (error) {
    logger.info("Error parsing dataset item input:", error);
    return itemInput;
  }
};

export const createExperimentJob = async ({
  event,
}: {
  event: z.infer<typeof ExperimentCreateEventSchema>;
}) => {
  logger.info("Processing experiment create job", event);
  const { datasetId, projectId, runId } = event;

  /********************
   * INPUT VALIDATION *
   ********************/

  // first, fetch all the context required for the experiment
  const datasetRun = await kyselyPrisma.$kysely
    .selectFrom("dataset_runs")
    .selectAll()
    .where("id", "=", runId)
    .where("project_id", "=", projectId)
    .executeTakeFirstOrThrow();

  if (!datasetRun.metadata) {
    throw new ForbiddenError(
      "Langfuse in-app experiments can only be run with available model and prompt configurations.",
    );
  }

  const metadata = ExperimentMetadataSchema.safeParse(datasetRun.metadata);
  if (!metadata.success) {
    throw new ForbiddenError(
      "Langfuse in-app experiments can only be run with available model and prompt configurations.",
    );
  }

  // validate the prompt
  const { prompt_id, provider, model, model_params } = metadata.data;

  const prompt = await kyselyPrisma.$kysely
    .selectFrom("prompts")
    .selectAll()
    .where("id", "=", prompt_id)
    .where("project_id", "=", event.projectId)
    .executeTakeFirstOrThrow();

  if (!prompt) {
    logger.error(`Prompt ${prompt_id} not found for project ${projectId}`);
    throw new InvalidRequestError(
      `Prompt ${prompt_id} not found for project ${projectId}`,
    );
  }

  const validatePromptContent = PromptContentSchema.safeParse(prompt.prompt);

  if (!validatePromptContent.success) {
    logger.error(
      `Prompt content not in expected format ${prompt_id} not found for project ${projectId}`,
    );
    throw new InvalidRequestError(
      `Prompt ${prompt_id} not found in expected format for project ${projectId}`,
    );
  }

  const extractedVariables = extractVariables(
    prompt?.type === "text"
      ? (prompt.prompt?.toString() ?? "")
      : JSON.stringify(prompt.prompt),
  );

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

  const validatedDatasetItems = datasetItems
    .filter(({ input }) => validateDatasetItem(input, extractedVariables))
    .map((datasetItem) => ({
      ...datasetItem,
      input: parseDatasetItemInput(
        datasetItem.input as Prisma.JsonObject, // this is safe because we already filtered for valid input
        extractedVariables,
      ),
    }));

  if (!validatedDatasetItems.length) {
    logger.error(
      `No Dataset ${datasetId} item input matches expected prompt variable format`,
    );
    throw new InvalidRequestError(
      `No Dataset ${datasetId} item input matches expected prompt variable format`,
    );
  }

  const apiKey = await prisma.llmApiKeys.findFirst({
    where: {
      projectId: event.projectId,
      provider,
    },
  });
  const parsedKey = LLMApiKeySchema.safeParse(apiKey);

  for (const datasetItem of validatedDatasetItems) {
    if (!parsedKey.success) {
      // this will fail the eval execution if a user deletes the API key.
      logger.error(
        `Job ${datasetItem.id} did not find API key for provider ${provider} and project ${event.projectId}. Eval will fail. ${parsedKey.error}`,
      );
      throw new LangfuseNotFoundError(
        `API key for provider ${provider} and project ${event.projectId} not found.`,
      );
    }

    /********************
     * VARIABLE EXTRACTION *
     ********************/

    const messages = replaceVariablesInPrompt(
      validatePromptContent.data,
      datasetItem.input, // validated format
      extractedVariables,
    );

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

    const traceParams = {
      tags: ["langfuse-prompt-experiment"], // LFE-2917: filter out any trace in trace upsert queue that has this tag set
      traceName: `dataset-run-item-${runItem.id.slice(0, 5)}`,
      traceId: newTraceId,
      projectId: event.projectId,
      authCheck: {
        validKey: true as const,
        scope: {
          projectId: event.projectId,
          accessLevel: "all",
        } as any,
      },
    };

    try {
      await backOff(
        async () =>
          await callLLM(
            datasetItem.id,
            parsedKey.data,
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
    } catch (e) {
      logger.error(e);
      throw new ExperimentError(
        e instanceof ApiError
          ? e.message
          : "Dataset run item failed to call LLM. No valid trace created.",
        {
          datasetRunItemId: runItem.id,
        },
      );
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
  }
};
