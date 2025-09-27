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
    .query(async ({ input, ctx }) => {
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
              .selectFrom("dataset_run_items")
              .select("dataset_run_id")
              .select((eb) => eb.fn.count("id").as("item_count"))
              .where("project_id", "=", input.projectId)
              .groupBy("dataset_run_id")
              .as("run_item_counts"),
          (join) =>
            join.onRef(
              "run_item_counts.dataset_run_id",
              "=",
              "regression_runs.id",
            ),
        )
        .selectAll("regression_runs")
        .select(["datasets.name as dataset_name", "run_item_counts.item_count"])
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
        runs: runs.map((run) => ({
          id: run.id,
          name: run.name,
          description: run.description,
          status: run.status,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
          datasetName: run.dataset_name ?? "Unknown",
          evaluators: run.evaluators as string[],
          totalRuns: run.total_runs,
          promptVariants: run.promptVariants as string[],
          completedRuns: Number((run as any).item_count ?? 0),
          avgLatency: null, // TODO: Calculate from completed runs
          avgTotalCost: null, // TODO: Calculate from completed runs
        })),
        totalCount,
      };
    }),

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

        if (!Boolean(allVariables.length)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Prompt "${prompt.name || prompt.id}" has no variables or placeholders. All prompts in a regression run must have valid variables.`,
          });
        }
      }

      // Validate dataset items match variables for at least one prompt
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

      let regressionRun;
      try {
        const runId = randomUUID();
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
            status: "pending",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .execute();

        regressionRun = { id: runId };

        // Create multiple dataset runs - one for each prompt
        for (let i = 0; i < input.promptIds.length; i++) {
          const promptId = input.promptIds[i]!;
          const prompt = prompts.find((p) => p.id === promptId)!;

          const metadata: ExperimentMetadata = {
            prompt_id: promptId,
            provider: input.provider,
            model: input.model,
            model_params: input.modelParams,
          };

          const datasetRunName = `${input.name || `Regression Run ${new Date().toISOString()}`} - ${prompt.name || `Prompt ${i + 1}`}`;

          const datasetRun = await ctx.prisma.datasetRuns.create({
            data: {
              name: datasetRunName,
              description: `Dataset run for prompt: ${prompt.name || promptId} (Part of regression run: ${runId})`,
              datasetId: input.datasetId,
              metadata: {
                ...metadata,
                regression_run_id: runId, // Track in metadata
                regression_run_prompt_index: i,
              },
              projectId: input.projectId,
            },
          });

          // Queue the dataset run for processing
          const queue = ExperimentCreateQueue.getInstance();
          await queue?.add(
            QueueName.ExperimentCreate,
            {
              name: QueueJobs.ExperimentCreateJob,
              id: randomUUID(),
              timestamp: new Date(),
              payload: {
                projectId: input.projectId,
                datasetId: input.datasetId,
                runId: datasetRun.id,
                description: `Dataset run ${i + 1}/${input.promptIds.length} for regression run ${runId}`,
              },
              retryBaggage: {
                originalJobTimestamp: new Date(),
                attempt: 0,
              },
            },
            {
              delay: i * 1000, // Stagger the runs by 1 second each
              jobId: `dataset-run-${datasetRun.id}`,
            },
          );
        }
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
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "promptExperiments:read",
      });

      const regressionRuns = await kyselyPrisma.$kysely
        .selectFrom("regression_runs")
        .selectAll()
        .where("project_id", "=", input.projectId)
        .orderBy("created_at", "desc")
        .execute();

      return regressionRuns.map((run) => ({
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
      }));
    }),

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

      // Get associated dataset runs (linked via metadata)
      const datasetRuns = await ctx.prisma.datasetRuns.findMany({
        where: {
          projectId: input.projectId,
          metadata: {
            path: ["regression_run_id"],
            equals: input.runId,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

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
});
