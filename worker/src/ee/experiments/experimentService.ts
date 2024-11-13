import { z } from "zod";
import {
  ChatMessageRole,
  LLMApiKeySchema,
  logger,
  PromptContent,
  ZodModelConfig,
  PromptContentSchema,
  DatasetRunItemUpsertQueue,
} from "@langfuse/shared/src/server";
import { kyselyPrisma, ObservationType, prisma } from "@langfuse/shared/src/db";
import { ExperimentCreateEventSchema } from "@langfuse/shared/src/server";
import {
  ForbiddenError,
  InternalServerError,
  InvalidRequestError,
  LangfuseNotFoundError,
  Prisma,
} from "@langfuse/shared";
import { backOff } from "exponential-backoff";
import { callLLM } from "../../features/utilities";
import { QueueJobs, redis } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

const metadataSchema = ZodModelConfig.extend({
  prompt_id: z.string(),
  provider: z.string(),
  model: z.string(),
}).strict();

function getIsCharOrUnderscore(value: string): boolean {
  const charOrUnderscore = /^[A-Za-z_]+$/;

  return charOrUnderscore.test(value);
}

function extractVariables(mustacheString: string): string[] {
  const mustacheRegex = /\{\{(.*?)\}\}/g;
  const uniqueVariables = new Set<string>();

  for (const match of mustacheString.matchAll(mustacheRegex)) {
    uniqueVariables.add(match[1]);
  }

  for (const variable of uniqueVariables) {
    // if validated fails, remove from set
    if (!getIsCharOrUnderscore(variable)) {
      uniqueVariables.delete(variable);
    }
  }

  return Array.from(uniqueVariables);
}

const generateTraceServerSide = async ({
  projectId,
  input,
  output,
  model,
  modelParameters,
  promptId,
}: {
  projectId: string;
  input: any;
  output: string;
  model: string;
  modelParameters: Record<string, any>;
  promptId: string;
}) => {
  const trace = await prisma.trace.create({
    data: {
      projectId,
      name: "langfuse-generated-trace",
      input,
      output,
      tags: ["langfuse-generated"],
    },
  });

  await prisma.observation.create({
    data: {
      projectId,
      name: "langfuse-generated-observation",
      traceId: trace.id,
      type: ObservationType.GENERATION,
      model,
      modelParameters,
      input,
      output,
      promptId,
    },
  });

  return trace;
};

const isValidObject = (input: Prisma.JsonValue): input is Prisma.JsonObject =>
  typeof input === "object" &&
  input !== null &&
  input !== undefined &&
  !Array.isArray(input);

const replaceVariablesInPrompt = (
  prompt: PromptContent,
  itemInput: Record<string, any>,
  variables: string[],
): { role: string; content: string }[] => {
  const processContent = (content: string) =>
    content.replace(/\{\{(\w+)\}\}/g, (_, variable) =>
      variables.includes(variable)
        ? itemInput[variable] || ""
        : `{{${variable}}}`,
    );

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
  if (!isValidObject(itemInput)) {
    return false;
  }
  return variables.some(
    (variable) =>
      Object.keys(itemInput).includes(variable) &&
      typeof itemInput[variable] === "string",
  );
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

  // validate the shape of the metadata using zod
  const metadata = metadataSchema.safeParse(datasetRun.metadata);
  if (!metadata.success) {
    throw new ForbiddenError(
      "Langfuse in-app experiments can only be run with available model and prompt configurations.",
    );
  }

  // validate the prompt
  const { prompt_id, provider, model, ...modelParams } = metadata.data;

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

  if (validatePromptContent.error) {
    logger.error(
      `Prompt content not in expected format ${prompt_id} not found for project ${projectId}`,
    );
    throw new InternalServerError(
      `Text prompt ${prompt_id} not found for project ${projectId}`,
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
    },
  });

  const validatedDatasetItems = datasetItems.filter(({ input }) =>
    validateDatasetItem(input, extractedVariables),
  );

  if (!validatedDatasetItems) {
    logger.error(
      `No Dataset ${datasetId} item input matches expected prompt variable format`,
    );
    throw new InvalidRequestError(
      `No Dataset ${datasetId} item input matches expected prompt variable format`,
    );
  }

  for (const datasetItem of validatedDatasetItems) {
    const apiKey = await prisma.llmApiKeys.findFirst({
      where: {
        projectId: event.projectId,
        provider,
      },
    });
    const parsedKey = LLMApiKeySchema.safeParse(apiKey);

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
      datasetItem.input as Prisma.JsonObject, // validated format
      extractedVariables,
    );

    /********************
     * LLM MODEL CALL *
     ********************/

    const parsedLLMOutput = await backOff(
      () =>
        callLLM(
          datasetItem.id,
          parsedKey.data,
          messages,
          modelParams,
          provider,
          model,
          z.object({
            response: z.string(),
          }),
        ),
      {
        numOfAttempts: 1, // turn off retries as Langchain is doing that for us already.
      },
    );

    /********************
     * SERVER SIDE TRACES *
     ********************/

    const trace = await generateTraceServerSide({
      projectId,
      input: datasetItem.input,
      output: parsedLLMOutput.response,
      model,
      modelParameters: modelParams,
      promptId: prompt_id,
    });

    /********************
     * RUN ITEM CREATION *
     ********************/

    await prisma.datasetRunItems.create({
      data: {
        datasetItemId: datasetItem.id,
        traceId: trace.id,
        datasetRunId: runId,
        projectId,
      },
    });

    /********************
     * ASYNC RUN ITEM EVAL *
     ********************/

    if (redis) {
      const queue = DatasetRunItemUpsertQueue.getInstance();
      if (queue) {
        await queue.add(
          QueueJobs.DatasetRunItemUpsert,
          {
            payload: {
              projectId,
              type: "dataset" as const,
              datasetItemId: datasetItem.id,
              traceId: trace.id,
            },
            id: randomUUID(),
            timestamp: new Date(),
            name: QueueJobs.DatasetRunItemUpsert as const,
          },
          {
            attempts: 3, // retry 3 times
            backoff: {
              type: "exponential",
              delay: 1000,
            },
            delay: 0, // adjust delay after server-side implementation
            removeOnComplete: true,
            removeOnFail: 1_000,
          },
        );
      }
    }
  }
};
