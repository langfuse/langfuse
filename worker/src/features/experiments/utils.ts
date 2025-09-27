import {
  ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  compileChatMessages,
  datasetItemMatchesVariable,
  extractPlaceholderNames,
  extractVariables,
  InvalidRequestError,
  LangfuseNotFoundError,
  MessagePlaceholderValues,
  Prisma,
  PromptContent,
  PromptType,
  QUEUE_ERROR_MESSAGES,
  stringifyValue,
} from "@langfuse/shared";
import { sql } from "kysely";
import { compileHandlebarString } from "../utils/utilities";
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
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import z from "zod/v4";
import { createHash } from "crypto";

/**
 * Generate deterministic trace ID based on dataset run and item IDs
 * This ensures both PostgreSQL and ClickHouse use the same trace ID
 */
export function generateUnifiedTraceId(
  runId: string,
  datasetItemId: string,
): string {
  const input = `${runId}-${datasetItemId}`;
  const hash = createHash("sha256").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const isValidPrismaJsonObject = (
  input: Prisma.JsonValue,
): input is Prisma.JsonObject =>
  typeof input === "object" &&
  input !== null &&
  input !== undefined &&
  !Array.isArray(input);

export const validateDatasetItem = (
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
  return await kyselyPrisma.$kysely
    .selectFrom("dataset_runs")
    .selectAll()
    .where("id", "=", datasetRunId)
    .where("project_id", "=", projectId)
    .executeTakeFirst();
};

export const fetchRegressionRun = async (
  regressionRunId: string,
  projectId: string,
) => {
  return await kyselyPrisma.$kysely
    .selectFrom("regression_runs")
    .selectAll()
    .where("id", "=", regressionRunId)
    .where("project_id", "=", projectId)
    .executeTakeFirst();
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
  itemInput: Record<string, any>,
  variables: string[],
  placeholderNames: string[] = [],
): ChatMessage[] => {
  const processContent = (content: string) => {
    // Extract only Handlebars variables from itemInput (exclude message placeholders)
    const filteredContext = Object.fromEntries(
      Object.entries(itemInput).filter(
        ([key]) => variables.includes(key) && !placeholderNames.includes(key),
      ),
    );

    // Apply Handlebars ONLY if the content contains `{{variable}}` pattern
    if (content.includes("{{")) {
      return compileHandlebarString(content, filteredContext);
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

export async function validateAndSetupExperiment(
  event: z.infer<typeof ExperimentCreateEventSchema>,
) {
  console.log(`\n=== VALIDATE AND SETUP EXPERIMENT START ===`);
  console.log(`Event:`, JSON.stringify(event, null, 2));
  
  const { datasetId, projectId, runId } = event;
  console.log(`Dataset ID: ${datasetId}`);
  console.log(`Project ID: ${projectId}`);
  console.log(`Run ID: ${runId}`);

  // Check if this is a regression run or dataset run
  console.log(`Attempting to fetch dataset run...`);
  let datasetRun = await fetchDatasetRun(runId, projectId);
  let metadata: any = null;
  
  console.log(`Dataset run found:`, !!datasetRun);

  if (!datasetRun) {
    console.log(`No dataset run found, trying regression run...`);
    // Try fetching as regression run
    const regressionRun = await fetchRegressionRun(runId, projectId);
    if (!regressionRun) {
      console.error(`❌ Neither dataset run nor regression run found for ID: ${runId}`);
      throw new LangfuseNotFoundError(`Run ${runId} not found`);
    }
    
    console.log(`✓ Found regression run:`, regressionRun.name);
    console.log(`Regression run dataset ID:`, regressionRun.dataset_id);

    // For regression runs, find the associated dataset run that contains the metadata
    console.log("🔍 Looking for dataset runs for regression run:", runId);
    console.log("Project ID:", projectId);
    console.log("Dataset ID:", regressionRun.dataset_id);
    
    const associatedDatasetRuns = await kyselyPrisma.$kysely
      .selectFrom("dataset_runs")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("dataset_id", "=", regressionRun.dataset_id)
      .where(sql`(metadata->>'regression_run_id')::text`, "=", runId)
      .execute();

    console.log("📊 Found dataset runs:", associatedDatasetRuns.length);
    console.log("📋 Dataset runs details:");
    associatedDatasetRuns.forEach((dr, index) => {
      console.log(`  [${index + 1}] ID: ${dr.id}, Name: ${dr.name}`);
      console.log(`      Metadata: ${JSON.stringify(dr.metadata, null, 2)}`);
    });

    if (associatedDatasetRuns.length === 0) {
      console.log("⚠️  No dataset runs found with regression_run_id metadata, searching all dataset runs...");
      // Try to find any dataset runs for this regression run without the metadata filter
      const allDatasetRuns = await kyselyPrisma.$kysely
        .selectFrom("dataset_runs")
        .selectAll()
        .where("project_id", "=", projectId)
        .where("dataset_id", "=", regressionRun.dataset_id)
        .execute();
      
      console.log("📊 All dataset runs for this dataset:", allDatasetRuns.length);
      console.log("📋 All dataset runs details:");
      allDatasetRuns.forEach((dr, index) => {
        console.log(`  [${index + 1}] ID: ${dr.id}, Name: ${dr.name}`);
        console.log(`      Metadata: ${JSON.stringify(dr.metadata, null, 2)}`);
        console.log(`      Created: ${dr.created_at}`);
      });
      
      console.error(`❌ No dataset runs found for regression run ${runId}`);
      throw new LangfuseNotFoundError(
        `No dataset runs found for regression run ${runId}`,
      );
    }

    // Use the first dataset run's metadata (all should have the same experiment metadata)
    const firstDatasetRun = associatedDatasetRuns[0];
    console.log(`📝 Using first dataset run for metadata:`, firstDatasetRun.id);
    console.log(`📝 First dataset run metadata:`, JSON.stringify(firstDatasetRun.metadata, null, 2));

    // Create a mock dataset run structure using the actual metadata
    datasetRun = {
      id: runId, // Use the regression run ID for the experiment processing
      name: regressionRun.name,
      description: regressionRun.description,
      project_id: regressionRun.project_id,
      dataset_id: regressionRun.dataset_id,
      created_at: regressionRun.created_at,
      updated_at: regressionRun.updated_at,
      metadata: firstDatasetRun.metadata,
    };
    
    console.log(`✓ Created mock dataset run structure`);
    metadata = datasetRun.metadata;
  } else {
    console.log(`✓ Using regular dataset run`);
    metadata = datasetRun.metadata;
    console.log(`📝 Dataset run metadata:`, JSON.stringify(metadata, null, 2));
  }

  // Validate experiment metadata
  console.log(`\n🔍 Validating experiment metadata...`);
  console.log(`Raw metadata:`, JSON.stringify(metadata, null, 2));
  console.log(`Metadata type:`, typeof metadata);
  
  const validatedRunMetadata = ExperimentMetadataSchema.safeParse(metadata);
  if (!validatedRunMetadata.success) {
    console.error(`❌ Experiment metadata validation failed:`);
    console.error(`Validation errors:`, JSON.stringify(validatedRunMetadata.error.issues, null, 2));
    console.error(`Expected schema fields: prompt_id, provider, model, model_params`);
    console.error(`Received fields:`, Object.keys(metadata || {}));
    throw new LangfuseNotFoundError(
      "Langfuse in-app experiments can only be run with prompt and model configurations in metadata.",
    );
  }
  
  console.log(`✓ Experiment metadata validation successful`);
  console.log(`Validated metadata:`, JSON.stringify(validatedRunMetadata.data, null, 2));

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
      `${QUEUE_ERROR_MESSAGES.API_KEY_ERROR} ${provider} not found.`,
    );
  }

  const validatedApiKey = LLMApiKeySchema.safeParse(apiKey);
  if (!validatedApiKey.success) {
    throw new LangfuseNotFoundError(
      `${QUEUE_ERROR_MESSAGES.API_KEY_ERROR} ${provider} not found.`,
    );
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
    allVariables,
    placeholderNames,
    projectId,
    datasetId,
    runId,
  };
}
