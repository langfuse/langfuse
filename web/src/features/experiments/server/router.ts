import { z } from "zod";
import { randomUUID } from "crypto";
import {
  type ExperimentMetadata,
  createDatasetItemFilterState,
  ExperimentCreateQueue,
  getCategoricalScoresGroupedByName,
  getDatasetItems,
  getEventsGroupedByExperimentDatasetId,
  getExperimentsCountFromEvents,
  getExperimentsFromEvents,
  getExperimentMetricsFromEvents,
  getNumericScoresGroupedByName,
  getScoresForExperimentItems,
  getScoresForExperiments,
  PromptService,
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
  extractVariables,
  validateDatasetItem,
  UnauthorizedError,
  PromptType,
  extractPlaceholderNames,
  type PromptMessage,
  isPresent,
  type DatasetItemDomain,
  singleFilter,
  orderBy,
  paginationZod,
  timeFilter,
} from "@langfuse/shared";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";

const ExperimentFilterOptions = z.object({
  projectId: z.string(),
  filter: z.array(singleFilter).nullable(),
  orderBy: orderBy,
  ...paginationZod,
});

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

const countValidDatasetItems = (
  datasetItems: Omit<DatasetItemDomain, "status">[],
  variables: string[],
): Record<string, number> => {
  const variableMap: Record<string, number> = {};

  for (const { input } of datasetItems) {
    // Step 1: Validate item
    if (!isPresent(input) || !validateDatasetItem(input, variables)) {
      continue;
    }

    // Step 2: Count variable matches

    // String with single variable - count that variable
    if (typeof input === "string" && variables.length === 1) {
      variableMap[variables[0]] = (variableMap[variables[0]] || 0) + 1;
      continue;
    }

    // For object inputs, count each matching variable
    if (typeof input === "object" && !Array.isArray(input)) {
      for (const variable of variables) {
        if (variable in input) {
          variableMap[variable] = (variableMap[variable] || 0) + 1;
        }
      }
    }
  }

  return variableMap;
};

export const experimentsRouter = createTRPCRouter({
  validateConfig: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        promptId: z.string(),
        datasetVersion: z.coerce.date().optional(),
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

      const promptService = new PromptService(ctx.prisma, redis);
      const resolvedPrompt = await promptService.resolvePrompt(prompt);

      if (!resolvedPrompt) {
        return {
          isValid: false,
          message: "Selected prompt not found.",
        };
      }

      const extractedVariables = extractVariables(
        resolvedPrompt?.type === PromptType.Text
          ? (resolvedPrompt.prompt?.toString() ?? "")
          : JSON.stringify(resolvedPrompt?.prompt),
      );

      const promptMessages =
        resolvedPrompt?.type === PromptType.Chat &&
        Array.isArray(resolvedPrompt?.prompt)
          ? resolvedPrompt.prompt
          : [];
      const placeholderNames = extractPlaceholderNames(
        promptMessages as PromptMessage[],
      );

      const allVariables = [...extractedVariables, ...placeholderNames];

      if (!Boolean(allVariables.length)) {
        return {
          isValid: false,
          message: "Selected prompt has no variables or placeholders.",
        };
      }

      const items = await getDatasetItems({
        projectId: input.projectId,
        filterState: createDatasetItemFilterState({
          datasetIds: [input.datasetId],
          status: "ACTIVE",
        }),
        version: input.datasetVersion,
      });

      if (!Boolean(items.length)) {
        return {
          isValid: false,
          message: "Selected dataset is empty or all items are inactive.",
        };
      }

      const variablesMap = countValidDatasetItems(items, allVariables);

      if (!Boolean(Object.keys(variablesMap).length)) {
        return {
          isValid: false,
          message: "No dataset item contains any variables.",
        };
      }

      return {
        isValid: true,
        totalItems: items.length,
        variablesMap: variablesMap,
      };
    }),

  createExperiment: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1, "Please enter an experiment name"),
        runName: z.string().min(1, "Run name is required"),
        promptId: z.string().min(1, "Please select a prompt"),
        datasetId: z.string().min(1, "Please select a dataset"),
        datasetVersion: z.coerce.date().optional(),
        description: z.string().max(1000).optional(),
        modelConfig: z.object({
          provider: z.string().min(1, "Please select a provider"),
          model: z.string().min(1, "Please select a model"),
          modelParams: ZodModelConfig,
        }),
        structuredOutputSchema: z.record(z.string(), z.any()).optional(),
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
        ...(input.structuredOutputSchema && {
          structured_output_schema: input.structuredOutputSchema,
        }),
        ...(input.datasetVersion && {
          dataset_version: input.datasetVersion,
        }),
      };

      const datasetRun = await ctx.prisma.datasetRuns.create({
        data: {
          name: input.runName,
          description: input.description,
          datasetId: input.datasetId,
          metadata: {
            ...metadata,
            experiment_name: input.name,
            experiment_run_name: input.runName,
          },
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
        runName: input.runName,
      };
    }),
  all: protectedProjectProcedure
    .input(ExperimentFilterOptions)
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "promptExperiments:read",
      });

      const experiments = await getExperimentsFromEvents({
        projectId: input.projectId,
        filter: input.filter ?? [],
        orderBy: input.orderBy,
        page: input.page,
        limit: input.limit,
      });

      return {
        data: experiments,
      };
    }),

  countAll: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        filter: z.array(singleFilter).nullable(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "promptExperiments:read",
      });

      const count = await getExperimentsCountFromEvents({
        projectId: input.projectId,
        filter: input.filter ?? [],
      });

      return {
        count: count,
      };
    }),

  metrics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        experimentIds: z.array(z.string()),
        filter: z.array(singleFilter).nullable(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "promptExperiments:read",
      });

      if (input.experimentIds.length === 0) {
        return [];
      }

      // Fetch metrics (cost, latency) and both score types in parallel
      const [metrics, itemScores, experimentScores] = await Promise.all([
        getExperimentMetricsFromEvents({
          projectId: input.projectId,
          experimentIds: input.experimentIds,
        }),
        getScoresForExperimentItems(input.projectId, input.experimentIds),
        getScoresForExperiments({
          projectId: input.projectId,
          runIds: input.experimentIds, // experiment_id === dataset_run_id
          excludeMetadata: true,
          includeHasMetadata: true,
        }),
      ]);

      return metrics.map((metric) => {
        // Filter item scores for this experiment
        const experimentItemScores = itemScores.filter(
          (s) => s.experimentId === metric.id,
        );

        return {
          id: metric.id,
          totalCost: metric.totalCost,
          latencyAvg: metric.latencyAvg,
          // Trace-level item scores (observation_id is null/empty)
          traceItemScores: aggregateScores(
            experimentItemScores.filter((s) => !s.observationId),
          ),
          // Observation-level item scores (observation_id is present)
          observationItemScores: aggregateScores(
            experimentItemScores.filter((s) => Boolean(s.observationId)),
          ),
          // Experiment-level scores (direct dataset_run_id match)
          experimentScores: aggregateScores(
            experimentScores.filter((s) => s.datasetRunId === metric.id),
          ),
        };
      });
    }),

  filterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        startTimeFilter: z.array(timeFilter).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "promptExperiments:read",
      });

      // Map startTimeFilter to Timestamp column for trace queries
      const traceTimestampFilters =
        input.startTimeFilter && input.startTimeFilter.length > 0
          ? input.startTimeFilter.map((f) => ({
              column: "Timestamp" as const,
              operator: f.operator,
              value: f.value,
              type: "datetime" as const,
            }))
          : [];

      const [numericScoreNames, categoricalScoreNames, experimentDatasetIds] =
        await Promise.all([
          getNumericScoresGroupedByName(
            input.projectId,
            traceTimestampFilters ?? [],
          ),
          getCategoricalScoresGroupedByName(
            input.projectId,
            traceTimestampFilters ?? [],
          ),
          getEventsGroupedByExperimentDatasetId(
            input.projectId,
            input.startTimeFilter ?? [],
          ),
        ]);

      const experimentDatasetIdSet = new Set<string>();
      for (const { experimentDatasetId } of experimentDatasetIds) {
        if (experimentDatasetId !== null) {
          experimentDatasetIdSet.add(experimentDatasetId);
        }
      }

      // Return score options for both observation-level and trace-level filters
      // The same score names are available at both levels
      const numericScoreOptions = numericScoreNames.map((score) => score.name);

      return {
        // Observation-level score options (eos.*)
        obs_scores_avg: numericScoreOptions,
        obs_score_categories: categoricalScoreNames,
        // Trace-level score options (ets.*)
        trace_scores_avg: numericScoreOptions,
        trace_score_categories: categoricalScoreNames,
        experimentDatasetIds: Array.from(experimentDatasetIdSet),
      };
    }),
});
