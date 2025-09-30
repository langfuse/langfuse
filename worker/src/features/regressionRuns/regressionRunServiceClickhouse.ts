import { prisma, kyselyPrisma } from "@langfuse/shared/src/db";
import {
  RegressionRunCreateEventSchema,
  logger,
  processEventBatch,
  eventTypes,
  PROMPT_EXPERIMENT_ENVIRONMENT,
} from "@langfuse/shared/src/server";
import z from "zod/v4";
import { v4 as uuidv4 } from "uuid";
import { sql } from "kysely";
import {
  extractVariables,
  extractPlaceholderNames,
  PromptType,
} from "@langfuse/shared";
import { callLLM } from "../utils";
import { backOff } from "exponential-backoff";
import {
  replaceVariablesInPrompt,
  parseDatasetItemInput,
} from "../experiments/utils";

type PromptMessage = {
  role: string;
  content: string;
};

export const createRegressionRunJobClickhouse = async ({
  event,
}: {
  event: z.infer<typeof RegressionRunCreateEventSchema>;
}) => {
  const startTime = Date.now();
  logger.info("Processing regression run create job", event);

  const { projectId, runId, datasetId } = event;
  const now = new Date();

  try {
    // Fetch regression run
    const run = await kyselyPrisma.$kysely
      .selectFrom("regression_runs")
      .selectAll()
      .where("id", "=", runId)
      .where("project_id", "=", projectId)
      .executeTakeFirst();

    if (!run) {
      throw new Error(
        `Regression run ${runId} for project ${projectId} no longer exists`,
      );
    }

    // Parse metadata
    const metadata = (run.metadata as any) || {};
    const provider = metadata.provider || "openai";
    const model = metadata.model || "gpt-4";
    const modelParams = metadata.model_params || {};

    // Mark regression run as running
    await kyselyPrisma.$kysely
      .updateTable("regression_runs")
      .set({ status: "running", updated_at: now })
      .where("id", "=", runId)
      .where("project_id", "=", projectId)
      .execute();

    // Fetch all pending regression run items for this run
    const items = await kyselyPrisma.$kysely
      .selectFrom("regression_run_items")
      .selectAll()
      .where("regression_run_id", "=", runId)
      .where("project_id", "=", projectId)
      .where("status", "=", "pending")
      .execute();

    logger.info(
      `Found ${items.length} regression run items to process for run ${runId}`,
    );

    if (items.length === 0) {
      await kyselyPrisma.$kysely
        .updateTable("regression_runs")
        .set({ status: "completed", updated_at: new Date() })
        .where("id", "=", runId)
        .where("project_id", "=", projectId)
        .execute();

      logger.info(`No items to process for regression run ${runId}`);
      return { success: true, processedCount: 0, failedCount: 0 };
    }

    // Fetch LLM API key for calls
    const llmApiKeys = await kyselyPrisma.$kysely
      .selectFrom("llm_api_keys")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("provider", "=", provider)
      .execute();

    if (!llmApiKeys || llmApiKeys.length === 0) {
      throw new Error(
        `No LLM API key found for project ${projectId} and provider ${provider}`,
      );
    }

    const kyselyApiKey = llmApiKeys[0]!;
    
    // Map Kysely snake_case to Prisma camelCase
    const validatedApiKey = {
      id: kyselyApiKey.id,
      projectId: kyselyApiKey.project_id,
      createdAt: kyselyApiKey.created_at,
      updatedAt: kyselyApiKey.updated_at,
      adapter: kyselyApiKey.adapter as any,
      provider: kyselyApiKey.provider,
      displaySecretKey: kyselyApiKey.display_secret_key,
      secretKey: kyselyApiKey.secret_key,
      extraHeaderKeys: kyselyApiKey.extra_header_keys,
      baseURL: kyselyApiKey.base_url,
      withDefaultModels: kyselyApiKey.with_default_models,
      customModels: kyselyApiKey.custom_models,
      config: kyselyApiKey.config as any,
    };

    // Fetch dataset items
    const datasetItems = await prisma.datasetItem.findMany({
      where: {
        datasetId,
        projectId,
        status: "ACTIVE",
      },
    });

    const datasetItemsMap = new Map(
      datasetItems.map((item) => [item.id, item]),
    );

    // Fetch all unique prompts
    const uniquePromptIds = [...new Set(items.map((item) => item.prompt_variant))];
    const prompts = await prisma.prompt.findMany({
      where: {
        id: { in: uniquePromptIds },
        projectId,
      },
    });

    const promptsMap = new Map(
      prompts.map((p) => [p.id, p]),
    );

    let processedCount = 0;
    let failedCount = 0;

    // Process items in smaller batches to avoid overwhelming the system
    const batchSize = 5;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      // Process batch with controlled concurrency
      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          try {
            const prompt: any = promptsMap.get(item.prompt_variant);
            const datasetItem: any = datasetItemsMap.get(item.dataset_item_id);

            if (!prompt) {
              throw new Error(`Prompt ${item.prompt_variant} not found`);
            }

            if (!datasetItem) {
              throw new Error(`Dataset item ${item.dataset_item_id} not found`);
            }

            // Mark item as running
            await kyselyPrisma.$kysely
              .updateTable("regression_run_items")
              .set({ status: "running", updated_at: new Date() })
              .where("id", "=", item.id)
              .where("project_id", "=", projectId)
              .execute();

            // Extract variables from prompt
            let extractedVariables: string[] = [];
            let placeholderNames: string[] = [];

            if (prompt.type === PromptType.Text) {
              const promptText =
                typeof prompt.prompt === "string"
                  ? prompt.prompt
                  : prompt.prompt
                    ? JSON.stringify(prompt.prompt)
                    : "";
              extractedVariables = extractVariables(promptText);
            } else if (
              prompt.type === PromptType.Chat &&
              Array.isArray(prompt.prompt)
            ) {
              extractedVariables = extractVariables(
                JSON.stringify(prompt.prompt),
              );
              placeholderNames = extractPlaceholderNames(
                prompt.prompt as PromptMessage[],
              );
            }

            const allVariables = [...extractedVariables, ...placeholderNames];

            // Parse dataset item input
            const parsedInput = parseDatasetItemInput(
              datasetItem.input as any,
              allVariables,
            );

            // Replace variables in prompt
            const processedPrompt = replaceVariablesInPrompt(
              prompt.prompt ?? {},
              parsedInput,
              prompt.type,
            );

            // Generate trace ID
            const newTraceId = `regression-${runId}-${item.prompt_variant}-${item.run_number}-${item.dataset_item_id}`;
            const observationId = uuidv4();
            const timestamp = new Date().toISOString();

            // Create trace event
            const traceEvent = {
              id: newTraceId,
              type: eventTypes.TRACE_CREATE,
              timestamp,
              body: {
                id: newTraceId,
                name: `Regression Run ${item.run_number} - ${prompt.name || item.prompt_variant}`,
                projectId,
                timestamp,
                tags: [`regression-run:${runId}`, `prompt:${item.prompt_variant}`, `run:${item.run_number}`],
                metadata: {
                  regressionRunId: runId,
                  promptVariant: item.prompt_variant,
                  runNumber: item.run_number,
                  datasetItemId: item.dataset_item_id,
                },
                public: false,
                release: PROMPT_EXPERIMENT_ENVIRONMENT,
              },
            };

            // Create generation event
            const generationEvent = {
              id: observationId,
              type: eventTypes.OBSERVATION_CREATE,
              timestamp,
              body: {
                id: observationId,
                traceId: newTraceId,
                type: "GENERATION",
                name: prompt.name || item.prompt_variant,
                startTime: timestamp,
                projectId,
                prompt: processedPrompt,
                model: model,
                modelParameters: modelParams,
                metadata: {
                  regressionRunItemId: item.id,
                  runNumber: item.run_number,
                  promptVariant: item.prompt_variant,
                },
              },
            };

            // Ingest trace and generation
            await processEventBatch(
              [traceEvent, generationEvent],
              {
                validKey: true,
                scope: {
                  projectId,
                  accessLevel: "project" as const,
                },
              },
              {
                isLangfuseInternal: true,
              },
            );

            // Prepare messages for LLM call
            let messages: any[];
            if (prompt.type === PromptType.Chat && Array.isArray(processedPrompt)) {
              messages = processedPrompt;
            } else {
              messages = [{ role: "user", content: String(processedPrompt) }];
            }

            // Call LLM
            const traceParams = {
              environment: PROMPT_EXPERIMENT_ENVIRONMENT,
              traceName: `regression-run-${item.run_number}`,
              traceId: newTraceId,
              projectId,
              observationId,
              metadata: {
                regressionRunId: runId,
                regressionRunItemId: item.id,
              },
              authCheck: {
                validKey: true as const,
                scope: {
                  projectId,
                  accessLevel: "project",
                } as any,
              },
            };

            await backOff(
              async () =>
                await callLLM(
                  validatedApiKey,
                  messages,
                  modelParams,
                  provider,
                  model,
                  traceParams,
                ),
              {
                numOfAttempts: 3,
                startingDelay: 1000,
                maxDelay: 10000,
              },
            );

            // Update item with success
            await kyselyPrisma.$kysely
              .updateTable("regression_run_items")
              .set({
                status: "completed",
                trace_id: newTraceId,
                observation_id: observationId,
                result: sql`${JSON.stringify({ success: true })}::jsonb`,
                updated_at: new Date(),
              })
              .where("id", "=", item.id)
              .where("project_id", "=", projectId)
              .execute();

            processedCount++;

            if (processedCount % 10 === 0) {
              logger.info(
                `Processed ${processedCount}/${items.length} items for regression run ${runId}`,
              );
            }
          } catch (error) {
            logger.error(
              `Failed to process regression run item ${item.id}`,
              error,
            );

            // Mark item as failed
            await kyselyPrisma.$kysely
              .updateTable("regression_run_items")
              .set({
                status: "failed",
                result: sql`${JSON.stringify({ error: String(error) })}::jsonb`,
                updated_at: new Date(),
              })
              .where("id", "=", item.id)
              .where("project_id", "=", projectId)
              .execute();

            failedCount++;
          }
        }),
      );

      // Log batch completion
      logger.info(
        `Batch ${Math.floor(i / batchSize) + 1} completed: ${batchResults.length} items processed`,
      );

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const duration = Date.now() - startTime;
    const finalStatus =
      failedCount === items.length ? "failed" : "completed";

    await kyselyPrisma.$kysely
      .updateTable("regression_runs")
      .set({ status: finalStatus, updated_at: new Date() })
      .where("id", "=", runId)
      .where("project_id", "=", projectId)
      .execute();

    logger.info(
      `Regression run ${runId} ${finalStatus} in ${duration}ms (processed ${processedCount} items, failed ${failedCount} items)`,
    );

    return {
      success: finalStatus !== "failed",
      processedCount,
      failedCount,
    };
  } catch (error) {
    logger.error(`Failed to process regression run ${runId}`, error);

    try {
      await kyselyPrisma.$kysely
        .updateTable("regression_runs")
        .set({ status: "failed", updated_at: new Date() })
        .where("id", "=", runId)
        .where("project_id", "=", projectId)
        .execute();
    } catch (statusError) {
      logger.error(
        `Failed to update regression run ${runId} status after error`,
        statusError,
      );
    }

    throw error;
  }
};