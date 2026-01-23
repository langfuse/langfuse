import {
  ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  compileChatMessages,
  extractPlaceholderNames,
  extractVariables,
  MessagePlaceholderValues,
  Prisma,
  PromptContent,
  PromptType,
  stringifyValue,
} from "@langfuse/shared";
import { compileTemplateString } from "../utils/utilities";
import {
  logger,
  PromptService,
  type PromptMessage,
  redis,
  ExperimentCreateEventSchema,
  ExperimentMetadataSchema,
  LLMApiKeySchema,
  PromptContentSchema,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import z from "zod/v4";
import { UnrecoverableError } from "../../errors/UnrecoverableError";

export const parseDatasetItemInput = (
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

export const fetchDatasetRun = async (
  datasetRunId: string,
  projectId: string,
) => {
  return await prisma.datasetRuns.findFirst({
    where: {
      id: datasetRunId,
      projectId,
    },
  });
};

export const fetchPrompt = async (promptId: string, projectId: string) => {
  const promptService = new PromptService(prisma, redis);

  const rawPrompt = await prisma.prompt.findUnique({
    where: { id: promptId, projectId },
  });

  return promptService.resolvePrompt(rawPrompt);
};

export const replaceVariablesInPrompt = (
  prompt: PromptContent,
  itemInput: Record<string, any> | null,
  variables: string[],
  placeholderNames: string[] = [],
): ChatMessage[] => {
  if (!itemInput) {
    throw Error("Dataset item has no input.");
  }

  const processContent = (content: string) => {
    // Extract only template variables from itemInput (exclude message placeholders)
    const filteredContext = Object.fromEntries(
      Object.entries(itemInput).filter(
        ([key]) => variables.includes(key) && !placeholderNames.includes(key),
      ),
    );

    // Apply template ONLY if the content contains `{{variable}}` pattern
    if (content.includes("{{")) {
      return compileTemplateString(content, filteredContext);
    }
    return content; // Return original content if no placeholders are found
  };
  if (typeof prompt === "string") {
    return [
      {
        role: ChatMessageRole.System,
        content: processContent(prompt),
        type: ChatMessageType.System as const,
      },
    ];
  }
  const placeholderValues: MessagePlaceholderValues = {};
  // itemInput to placeholderValues
  for (const placeholderName of placeholderNames) {
    if (!(placeholderName in itemInput)) {
      // TODO: should we throw?
      throw new Error(`Missing placeholder value for '${placeholderName}'`);
    }
    const value = itemInput[placeholderName];
    // for stringified arrays (e.g. from dataset processing)
    let actualValue = value;
    if (typeof value === "string") {
      try {
        actualValue = JSON.parse(value);
      } catch (_e) {
        throw new Error(
          `Invalid placeholder value for '${placeholderName}': unable to parse JSON`,
        );
      }
    }
    if (!Array.isArray(actualValue)) {
      throw new Error(
        `Placeholder '${placeholderName}' must be an array of messages`,
      );
    }
    // Allow arbitrary objects - e.g. for users who want to pass ChatML messages.
    // Used to validate for role and content key existence here.
    const validMessages = actualValue.every(
      (msg) => typeof msg === "object" && msg !== null,
    );
    if (!validMessages) {
      throw new Error(
        `Invalid placeholder value for '${placeholderName}': all items must be objects`,
      );
    }
    placeholderValues[placeholderName] = actualValue.map((msg) => ({
      ...msg,
      type: ChatMessageType.PublicAPICreated as const,
    }));
  }
  const compiledMessages = compileChatMessages(
    prompt as PromptMessage[],
    placeholderValues,
    {},
  );
  return compiledMessages.map((message) => ({
    ...message,
    // Only process content if it exists as string (for standard ChatMessages)
    ...(typeof message.content === "string" && {
      content: processContent(message.content),
    }),
    type: ChatMessageType.PublicAPICreated as const,
  }));
};

export type PromptExperimentConfig = Awaited<
  ReturnType<typeof validateAndSetupExperiment>
>;
export async function validateAndSetupExperiment(
  event: z.infer<typeof ExperimentCreateEventSchema>,
) {
  const { datasetId, projectId, runId } = event;

  // Validate dataset run exists
  const datasetRun = await fetchDatasetRun(runId, projectId);

  if (!datasetRun) {
    // throw regular error here to allow retries for race conditions with dataset run creation
    throw Error(`Dataset run ${runId} not found`);
  }

  // Validate experiment metadata
  const validatedRunMetadata = ExperimentMetadataSchema.safeParse(
    datasetRun.metadata,
  );
  if (!validatedRunMetadata.success) {
    throw new UnrecoverableError(
      "Langfuse in-app experiments require prompt and model configurations in dataset run metadata",
    );
  }

  const { prompt_id, provider, model, model_params } =
    validatedRunMetadata.data;

  // Fetch and validate prompt
  const prompt = await fetchPrompt(prompt_id, projectId);
  if (!prompt) {
    throw new UnrecoverableError(`Prompt ${prompt_id} not found`);
  }
  const validatedPrompt = PromptContentSchema.safeParse(prompt.prompt);
  if (!validatedPrompt.success) {
    throw new UnrecoverableError(`Prompt ${prompt_id} has invalid format`);
  }

  // Fetch and validate API key
  const apiKey = await prisma.llmApiKeys.findFirst({
    where: { projectId, provider },
  });
  if (!apiKey) {
    throw new UnrecoverableError(`API key for provider ${provider} not found`);
  }

  const validatedApiKey = LLMApiKeySchema.safeParse(apiKey);
  if (!validatedApiKey.success) {
    throw new UnrecoverableError(`API key for provider ${provider} not found`);
  }

  // Extract variables from prompt
  const extractedVariables = extractVariables(
    prompt?.type === PromptType.Text
      ? (prompt.prompt?.toString() ?? "")
      : JSON.stringify(prompt.prompt),
  );

  const placeholderNames =
    prompt?.type === PromptType.Chat && Array.isArray(validatedPrompt.data)
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
    structuredOutputSchema: validatedRunMetadata.data.structured_output_schema,
    experimentName: validatedRunMetadata.data.experiment_name,
    experimentRunName: validatedRunMetadata.data.experiment_run_name,
    datasetVersion: validatedRunMetadata.data.dataset_version,
    allVariables,
    placeholderNames,
    projectId,
    datasetId,
    runId,
  };
}
