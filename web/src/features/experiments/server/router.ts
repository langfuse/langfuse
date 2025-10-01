import { z } from "zod/v4";
import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import {
  datasetItemMatchesVariable,
  extractPlaceholderNames,
  extractVariables,
} from "@langfuse/shared";
import {
  type PromptMessage,
  type ExperimentMetadata,
  ExperimentCreateQueue,
  RegressionRunCreateQueue,
  QueueJobs,
  QueueName,
  redis,
  ZodModelConfig,
} from "@langfuse/shared/src/server";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  type DatasetItem,
  DatasetStatus,
  UnauthorizedError,
  PromptType,
  Prisma,
} from "@langfuse/shared";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import { sql } from "kysely";

const ValidConfigResponse = z.object({
  isValid: z.literal(true),
  totalItems: z.number(),
  variablesMap: z.record(z.string(), z.number()),
});

const InvalidConfigResponse = z.object({
  isValid: z.literal(false),
  message: z.string(),
});

const ConfigResponse = z.discriminatedUnion("isValid", [
  ValidConfigResponse,
  InvalidConfigResponse,
]);

const validateDatasetItems = (
  datasetItems: DatasetItem[],
  variables: string[],
): Record<string, number> => {
  const variableMap: Record<string, number> = {};

  for (const { input } of datasetItems) {
    if (!input) {
      continue;
    }

    // For each variable, increment its count if it exists in this item
    for (const variable of variables) {
      if (datasetItemMatchesVariable(input, variable)) {
        variableMap[variable] = (variableMap[variable] || 0) + 1;
      }
    }
  }

  return variableMap;
};

export const experimentsRouter = createTRPCRouter({
  // Regression Runs API endpoints
  getRegressionRuns: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        experimentId: z.string().optional(),
        page: z.number().default(0),
        limit: z.number().default(50),
      }),
    )
    .query(
      async ({
        input,
        ctx,
      }): Promise<{
        runs: Array<{
          id: string;
          name: string;
          description: string | null;
          status: string;
          experimentId: string;
          datasetId: string;
          createdAt: Date;
          updatedAt: Date;
          datasetName: string;
          evaluators: string[];
          totalRuns: number;
          promptVariants: string[];
          totalItems: number;
          completedItems: number;
          failedItems: number;
          runningItems: number;
          avgLatency: number | null;
          avgTotalCost: number | null;
        }>;
        totalCount: number;
      }> => {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "promptExperiments:read",
        });
        const runs = await kyselyPrisma.$kysely
          .selectFrom("regression_runs")
          .leftJoin("datasets", "datasets.id", "regression_runs.dataset_id")
          .leftJoin(
            (qb) =>
              qb
                .selectFrom("regression_run_items")
                .select("regression_run_id")
                .select((eb) => eb.fn.count("id").as("total_items"))
                .select((eb) =>
                  eb.fn
                    .count("id")
                    .filterWhere("status", "=", "completed")
                    .as("completed_items"),
                )
                .select((eb) =>
                  eb.fn
                    .count("id")
                    .filterWhere("status", "=", "failed")
                    .as("failed_items"),
                )
                .select((eb) =>
                  eb.fn
                    .count("id")
                    .filterWhere("status", "=", "running")
                    .as("running_items"),
                )
                .where("project_id", "=", input.projectId)
                .groupBy("regression_run_id")
                .as("run_item_counts"),
            (join) =>
              join.onRef(
                "run_item_counts.regression_run_id",
                "=",
                "regression_runs.id",
              ),
          )
          .selectAll("regression_runs")
          .select([
            "datasets.name as dataset_name",
            "run_item_counts.total_items",
            "run_item_counts.completed_items",
            "run_item_counts.failed_items",
            "run_item_counts.running_items",
          ])
          .where("regression_runs.project_id", "=", input.projectId)
          .$if(!!input.experimentId, (qb) =>
            qb.where("regression_runs.experiment_id", "=", input.experimentId!),
          )
          .orderBy("regression_runs.created_at", "desc")
          .limit(input.limit)
          .offset(input.page * input.limit)
          .execute();

        const totalCount = await kyselyPrisma.$kysely
          .selectFrom("regression_runs")
          .where("project_id", "=", input.projectId)
          .$if(!!input.experimentId, (qb) =>
            qb.where("experiment_id", "=", input.experimentId!),
          )
          .select((eb) => eb.fn.count("id").as("count"))
          .executeTakeFirst()
          .then((result) => Number(result?.count || 0));

        return {
          runs: runs.map((run: any) => ({
            id: run.id,
            name: run.name,
            description: run.description,
            status: run.status,
            experimentId: run.experiment_id,
            datasetId: run.dataset_id,
            createdAt: run.created_at,
            updatedAt: run.updated_at,
            datasetName: run.dataset_name ?? "Unknown",
            evaluators: run.evaluators as string[],
            totalRuns: run.total_runs,
            promptVariants: run.promptVariants as string[],
            totalItems: Number(run.total_items ?? 0),
            completedItems: Number(run.completed_items ?? 0),
            failedItems: Number(run.failed_items ?? 0),
            runningItems: Number(run.running_items ?? 0),
            avgLatency: null, // TODO: Calculate from traces
            avgTotalCost: null, // TODO: Calculate from traces
          })),
          totalCount,
        };
      },
    ),

  createRegressionRun: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        promptIds: z
          .array(z.string())
          .min(1, "At least one prompt is required"),
        provider: z.string(),
        model: z.string(),
        modelParams: ZodModelConfig,
        datasetId: z.string(),
        evaluators: z.array(z.string()).default([]),
        totalRuns: z.number().default(100),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "promptExperiments:CUD",
      });

      if (!redis) {
        throw new UnauthorizedError("Regression run creation failed");
      }

      // Validate that all prompts exist and have valid variables/placeholders
      const prompts = await ctx.prisma.prompt.findMany({
        where: {
          id: { in: input.promptIds },
          projectId: input.projectId,
        },
      });

      if (prompts.length !== input.promptIds.length) {
        const foundIds = prompts.map((p) => p.id);
        const missingIds = input.promptIds.filter(
          (id) => !foundIds.includes(id),
        );
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Prompts not found: ${missingIds.join(", ")}`,
        });
      }

      // Validate each prompt using the same logic as validateConfig
      // Note: Unlike the old validation, we now allow prompts with no variables
      // This matches dataset run behavior where static prompts are valid
      for (const prompt of prompts) {
        const extractedVariables = extractVariables(
          prompt?.type === PromptType.Text
            ? (prompt.prompt?.toString() ?? "")
            : JSON.stringify(prompt.prompt),
        );

        const promptMessages =
          prompt?.type === PromptType.Chat && Array.isArray(prompt.prompt)
            ? prompt.prompt
            : [];
        const placeholderNames = extractPlaceholderNames(
          promptMessages as PromptMessage[],
        );

        const allVariables = [...extractedVariables, ...placeholderNames];

        // Apply the same validation as single dataset runs (validateConfig)
        // If prompt has no variables, it's still valid (will run same prompt against all dataset items)
        if (!Boolean(allVariables.length)) {
          // This matches validateConfig behavior - allows prompts with no variables
          continue;
        }
      }

      // Validate dataset items match variables (same validation as single dataset runs)
      const datasetItems = await ctx.prisma.datasetItem.findMany({
        where: {
          datasetId: input.datasetId,
          projectId: input.projectId,
          status: DatasetStatus.ACTIVE,
        },
      });

      if (!Boolean(datasetItems.length)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected dataset is empty or all items are inactive.",
        });
      }

      // For prompts that have variables, validate that dataset items contain them
      // This matches the same validation logic used in validateConfig for single dataset runs
      for (const prompt of prompts) {
        const extractedVariables = extractVariables(
          prompt?.type === PromptType.Text
            ? (prompt.prompt?.toString() ?? "")
            : JSON.stringify(prompt.prompt),
        );

        const promptMessages =
          prompt?.type === PromptType.Chat && Array.isArray(prompt.prompt)
            ? prompt.prompt
            : [];
        const placeholderNames = extractPlaceholderNames(
          promptMessages as PromptMessage[],
        );

        const allVariables = [...extractedVariables, ...placeholderNames];

        // Skip validation for prompts with no variables (same as validateConfig)
        if (!Boolean(allVariables.length)) {
          continue;
        }

        // Validate that dataset items contain the prompt variables
        const variablesMap = validateDatasetItems(datasetItems, allVariables);

        if (!Boolean(Object.keys(variablesMap).length)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `No dataset item contains any variables matching the prompt placeholders for prompt "${prompt.name || prompt.id}".`,
          });
        }
      }

      let regressionRun;
      try {
        const runId = randomUUID();

        // Prepare metadata with LLM configuration
        const metadata = {
          provider: input.provider,
          model: input.model,
          model_params: input.modelParams,
        };

        await kyselyPrisma.$kysely
          .insertInto("regression_runs")
          .values({
            id: runId,
            name: input.name || `Regression Run ${new Date().toISOString()}`,
            description: input.description,
            project_id: input.projectId,
            experiment_id: input.promptIds[0] || "", // Use first prompt ID as primary reference
            dataset_id: input.datasetId,
            evaluators: sql`${JSON.stringify(input.evaluators)}::jsonb`,
            total_runs: input.totalRuns,
            promptVariants: sql`${JSON.stringify(input.promptIds)}::jsonb`, // All prompt variants
            metadata: sql`${JSON.stringify(metadata)}::jsonb`,
            status: "pending",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .execute();

        regressionRun = { id: runId };

        console.log(`\n=== Creating regression run items for run ${runId} ===`);
        console.log(`Prompts: ${input.promptIds.length}`);
        console.log(`Dataset items: ${datasetItems.length}`);
        console.log(`Runs per prompt: ${input.totalRuns}`);
        console.log(
          `Total items to create: ${input.promptIds.length * datasetItems.length * input.totalRuns}`,
        );

        // Create RegressionRunItems: N runs per prompt per dataset item
        const itemsToCreate: Array<{
          id: string;
          project_id: string;
          regression_run_id: string;
          prompt_variant: string;
          run_number: number;
          dataset_item_id: string;
          status: string;
          created_at: Date;
          updated_at: Date;
        }> = [];

        for (
          let promptIdx = 0;
          promptIdx < input.promptIds.length;
          promptIdx++
        ) {
          const promptId = input.promptIds[promptIdx]!;
          const prompt = prompts.find((p) => p.id === promptId)!;

          console.log(
            `\nProcessing prompt ${promptIdx + 1}/${input.promptIds.length}: ${prompt.name || promptId}`,
          );

          for (let runNum = 1; runNum <= input.totalRuns; runNum++) {
            for (const datasetItem of datasetItems) {
              itemsToCreate.push({
                id: randomUUID(),
                project_id: input.projectId,
                regression_run_id: runId,
                prompt_variant: promptId,
                run_number: runNum,
                dataset_item_id: datasetItem.id,
                status: "pending",
                created_at: new Date(),
                updated_at: new Date(),
              });
            }
          }
        }

        console.log(`✓ Prepared ${itemsToCreate.length} regression run items`);

        // Insert all items in batches to avoid overwhelming the database
        const batchSize = 1000;
        for (let i = 0; i < itemsToCreate.length; i += batchSize) {
          const batch = itemsToCreate.slice(i, i + batchSize);
          await kyselyPrisma.$kysely
            .insertInto("regression_run_items")
            .values(batch)
            .execute();
          console.log(
            `✓ Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(itemsToCreate.length / batchSize)} (${batch.length} items)`,
          );
        }

        console.log(
          `✓ Created all ${itemsToCreate.length} regression run items`,
        );

        // Queue the regression run for processing
        const queue = RegressionRunCreateQueue.getInstance();
        await queue?.add(
          QueueName.RegressionRunCreate,
          {
            name: QueueJobs.RegressionRunCreateJob,
            id: randomUUID(),
            timestamp: new Date(),
            payload: {
              projectId: input.projectId,
              runId: runId,
              datasetId: input.datasetId,
              description: input.description || "Regression run processing",
            },
            retryBaggage: {
              originalJobTimestamp: new Date(),
              attempt: 0,
            },
          },
          {
            jobId: `regression-run-${runId}`,
          },
        );

        console.log(`✓ Queued regression run ${runId} for processing`);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2002") {
            // Unique constraint violation
            const failedFields = error.meta?.target as string[] | undefined;
            if (failedFields?.includes("name")) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `A regression run with the name "${input.name || `Regression Run ${new Date().toISOString()}`}" already exists for this experiment. Please choose a different name.`,
              });
            }
          }
        }
        throw error;
      }

      // Regression run created successfully with dataset runs queued
      return { success: true, runId: regressionRun.id };
    }),

  deleteRegressionRun: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        runId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "promptExperiments:CUD",
      });

      await kyselyPrisma.$kysely
        .deleteFrom("regression_runs")
        .where("id", "=", input.runId)
        .where("project_id", "=", input.projectId)
        .execute();

      return { success: true };
    }),

  getAllRegressionRuns: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(
      async ({
        input,
        ctx,
      }): Promise<
        Array<{
          id: string;
          name: string;
          description: string | null;
          status: string;
          experimentId: string;
          datasetId: string;
          evaluators: unknown;
          totalRuns: number;
          promptVariants: unknown;
          createdAt: Date;
          updatedAt: Date;
          totalItems: number;
          completedItems: number;
          failedItems: number;
          runningItems: number;
        }>
      > => {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "promptExperiments:read",
        });

        const regressionRuns = await kyselyPrisma.$kysely
          .selectFrom("regression_runs")
          .leftJoin(
            (qb) =>
              qb
                .selectFrom("regression_run_items")
                .select("regression_run_id")
                .select((eb) => eb.fn.count("id").as("total_items"))
                .select((eb) =>
                  eb.fn
                    .count("id")
                    .filterWhere("status", "=", "completed")
                    .as("completed_items"),
                )
                .select((eb) =>
                  eb.fn
                    .count("id")
                    .filterWhere("status", "=", "failed")
                    .as("failed_items"),
                )
                .select((eb) =>
                  eb.fn
                    .count("id")
                    .filterWhere("status", "=", "running")
                    .as("running_items"),
                )
                .where("project_id", "=", input.projectId)
                .groupBy("regression_run_id")
                .as("run_item_counts"),
            (join) =>
              join.onRef(
                "run_item_counts.regression_run_id",
                "=",
                "regression_runs.id",
              ),
          )
          .selectAll("regression_runs")
          .select([
            "run_item_counts.total_items",
            "run_item_counts.completed_items",
            "run_item_counts.failed_items",
            "run_item_counts.running_items",
          ])
          .where("regression_runs.project_id", "=", input.projectId)
          .orderBy("regression_runs.created_at", "desc")
          .execute();

        return regressionRuns.map((run: any) => ({
          id: run.id,
          name: run.name,
          description: run.description,
          status: run.status,
          experimentId: run.experiment_id,
          datasetId: run.dataset_id,
          evaluators: run.evaluators,
          totalRuns: run.total_runs,
          promptVariants: run.promptVariants,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
          totalItems: Number(run.total_items ?? 0),
          completedItems: Number(run.completed_items ?? 0),
          failedItems: Number(run.failed_items ?? 0),
          runningItems: Number(run.running_items ?? 0),
        }));
      },
    ),

  getRegressionRunWithResults: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        runId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "promptExperiments:read",
      });

      // Get the regression run
      const regressionRun = await kyselyPrisma.$kysely
        .selectFrom("regression_runs")
        .selectAll()
        .where("id", "=", input.runId)
        .where("project_id", "=", input.projectId)
        .executeTakeFirst();

      if (!regressionRun) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Regression run not found",
        });
      }

      // Get regression run items grouped by dataset item
      const items = await kyselyPrisma.$kysely
        .selectFrom("regression_run_items")
        .selectAll()
        .where("regression_run_id", "=", input.runId)
        .where("project_id", "=", input.projectId)
        .orderBy("dataset_item_id", "asc")
        .orderBy("prompt_variant", "asc")
        .orderBy("run_number", "asc")
        .execute();

      // Group items by dataset item and get stats per prompt per dataset item
      const datasetItemGroups = items.reduce(
        (acc, item) => {
          if (!acc[item.dataset_item_id]) {
            acc[item.dataset_item_id] = {
              datasetItemId: item.dataset_item_id,
              promptResults: {},
              totalRuns: 0,
              completed: 0,
              failed: 0,
              running: 0,
              pending: 0,
            };
          }

          const group = acc[item.dataset_item_id];

          // Group by prompt within each dataset item
          if (!group.promptResults[item.prompt_variant]) {
            group.promptResults[item.prompt_variant] = {
              promptId: item.prompt_variant,
              runs: [],
              completed: 0,
              failed: 0,
              running: 0,
              pending: 0,
            };
          }

          group.promptResults[item.prompt_variant].runs.push(item);
          group.totalRuns++;

          // Update prompt-specific stats
          if (item.status === "completed") {
            group.promptResults[item.prompt_variant].completed++;
            group.completed++;
          } else if (item.status === "failed") {
            group.promptResults[item.prompt_variant].failed++;
            group.failed++;
          } else if (item.status === "running") {
            group.promptResults[item.prompt_variant].running++;
            group.running++;
          } else if (item.status === "pending") {
            group.promptResults[item.prompt_variant].pending++;
            group.pending++;
          }

          return acc;
        },
        {} as Record<string, any>,
      );

      // Convert promptResults object to array for each dataset item
      const datasetRuns = Object.values(datasetItemGroups).map(
        (group: any) => ({
          ...group,
          promptResults: Object.values(group.promptResults),
        }),
      );

      const metadata = (regressionRun.metadata as any) || {};

      return {
        id: regressionRun.id,
        name: regressionRun.name,
        description: regressionRun.description,
        status: regressionRun.status,
        experimentId: regressionRun.experiment_id,
        datasetId: regressionRun.dataset_id,
        evaluators: regressionRun.evaluators,
        totalRuns: regressionRun.total_runs,
        promptVariants: regressionRun.promptVariants,
        createdAt: regressionRun.created_at,
        updatedAt: regressionRun.updated_at,
        provider: metadata.provider,
        model: metadata.model,
        modelParams: metadata.model_params,
        datasetRuns: datasetRuns,
      };
    }),

  validateConfig: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        promptId: z.string(),
      }),
    )
    .output(ConfigResponse)
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "promptExperiments:CUD",
      });

      const prompt = await ctx.prisma.prompt.findFirst({
        where: {
          id: input.promptId,
          projectId: input.projectId,
        },
      });

      if (!prompt) {
        return {
          isValid: false,
          message: "Selected prompt not found.",
        };
      }

      const extractedVariables = extractVariables(
        prompt?.type === PromptType.Text
          ? (prompt.prompt?.toString() ?? "")
          : JSON.stringify(prompt.prompt),
      );

      const promptMessages =
        prompt?.type === PromptType.Chat && Array.isArray(prompt.prompt)
          ? prompt.prompt
          : [];
      const placeholderNames = extractPlaceholderNames(
        promptMessages as PromptMessage[],
      );

      const allVariables = [...extractedVariables, ...placeholderNames];

      const datasetItems = await ctx.prisma.datasetItem.findMany({
        where: {
          datasetId: input.datasetId,
          projectId: input.projectId,
          status: DatasetStatus.ACTIVE,
        },
      });

      if (!Boolean(datasetItems.length)) {
        return {
          isValid: false,
          message: "Selected dataset is empty or all items are inactive.",
        };
      }

      // If prompt has no variables, it's still valid for scenarios like:
      // 1. Regression runs testing static prompts against different inputs
      // 2. Dataset runs where dataset items contain different test scenarios
      if (!Boolean(allVariables.length)) {
        return {
          isValid: true,
          totalItems: datasetItems.length,
          variablesMap: {}, // No variables to map
          message:
            "Prompt has no variables. Will run the same prompt against all dataset items.",
        };
      }

      // If prompt has variables, validate that dataset items contain them
      const variablesMap = validateDatasetItems(datasetItems, allVariables);

      if (!Boolean(Object.keys(variablesMap).length)) {
        return {
          isValid: false,
          message:
            "No dataset item contains any variables matching the prompt placeholders.",
        };
      }

      return {
        isValid: true,
        totalItems: datasetItems.length,
        variablesMap: variablesMap,
      };
    }),

  createExperiment: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().optional(),
        promptId: z.string().min(1, "Please select a prompt"),
        datasetId: z.string().min(1, "Please select a dataset"),
        description: z.string().max(1000).optional(),
        modelConfig: z.object({
          provider: z.string().min(1, "Please select a provider"),
          model: z.string().min(1, "Please select a model"),
          modelParams: ZodModelConfig,
        }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "promptExperiments:CUD",
      });

      if (!redis) {
        throw new UnauthorizedError("Experiment creation failed");
      }

      const metadata: ExperimentMetadata = {
        prompt_id: input.promptId,
        provider: input.modelConfig.provider,
        model: input.modelConfig.model,
        model_params: input.modelConfig.modelParams,
      };
      const name =
        input.name ?? `${input.promptId}-${new Date().toISOString()}`;

      const datasetRun = await ctx.prisma.datasetRuns.create({
        data: {
          name: name,
          description: input.description,
          datasetId: input.datasetId,
          metadata: metadata,
          projectId: input.projectId,
        },
      });

      const queue = ExperimentCreateQueue.getInstance();

      if (queue) {
        await queue.add(QueueName.ExperimentCreate, {
          name: QueueJobs.ExperimentCreateJob,
          id: randomUUID(),
          timestamp: new Date(),
          payload: {
            projectId: input.projectId,
            datasetId: input.datasetId,
            runId: datasetRun.id,
            description: input.description,
          },
          retryBaggage: {
            originalJobTimestamp: new Date(),
            attempt: 0,
          },
        });
      }

      return {
        success: true,
        datasetId: input.datasetId,
        runId: datasetRun.id,
        runName: name,
      };
    }),

  getRegressionRunItemsByPrompt: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        runId: z.string(),
        promptId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "promptExperiments:read",
      });

      // Get the regression run to get the dataset_id
      const regressionRun = await kyselyPrisma.$kysely
        .selectFrom("regression_runs")
        .select(["dataset_id", "metadata"])
        .where("id", "=", input.runId)
        .where("project_id", "=", input.projectId)
        .executeTakeFirst();

      if (!regressionRun) {
        return [];
      }

      // Get all regression run items for this prompt, grouped by dataset item
      const items = await kyselyPrisma.$kysely
        .selectFrom("regression_run_items as rri")
        .select([
          "rri.dataset_item_id",
          "rri.prompt_variant",
          "rri.trace_id",
          "rri.status",
          "rri.run_number",
          "rri.created_at",
        ])
        .where("rri.regression_run_id", "=", input.runId)
        .where("rri.prompt_variant", "=", input.promptId)
        .where("rri.project_id", "=", input.projectId)
        .orderBy("rri.dataset_item_id", "asc")
        .orderBy("rri.run_number", "asc")
        .execute();

      // Group by dataset item ID
      type RegressionRunItem = (typeof items)[number];
      const groupedByDatasetItem: Record<string, RegressionRunItem[]> = {};

      for (const item of items) {
        if (!groupedByDatasetItem[item.dataset_item_id]) {
          groupedByDatasetItem[item.dataset_item_id] = [];
        }
        groupedByDatasetItem[item.dataset_item_id].push(item);
      }

      // Return the grouped data with run information
      return Object.entries(groupedByDatasetItem).map(
        ([datasetItemId, runItems]) => ({
          datasetItemId,
          runs: runItems.map((run) => ({
            id: run.trace_id ?? "",
            traceId: run.trace_id,
            status: run.status,
            runNumber: run.run_number,
            createdAt: run.created_at,
          })),
          totalRuns: runItems.length,
          completed: runItems.filter((r) => r.status === "completed").length,
          failed: runItems.filter((r) => r.status === "failed").length,
          running: runItems.filter((r) => r.status === "running").length,
        }),
      );
    }),

  getRegressionRunById: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        runId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "promptExperiments:read",
      });

      const run = await kyselyPrisma.$kysely
        .selectFrom("regression_runs")
        .selectAll()
        .where("id", "=", input.runId)
        .where("project_id", "=", input.projectId)
        .executeTakeFirst();

      if (!run) {
        return null;
      }

      return {
        id: run.id,
        name: run.name,
        description: run.description,
        datasetId: run.dataset_id,
        metadata: run.metadata,
        status: run.status,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
      };
    }),
});
