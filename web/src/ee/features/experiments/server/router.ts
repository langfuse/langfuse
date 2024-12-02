import { z } from "zod";
import { randomUUID } from "crypto";
import {
  type ExperimentMetadata,
  QueueJobs,
  QueueName,
  redis,
  ZodModelConfig,
  ExperimentCreateQueue,
} from "@langfuse/shared/src/server";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { PromptType } from "@/src/features/prompts/server/utils/validation";
import {
  type DatasetItem,
  extractVariables,
  UnauthorizedError,
} from "@langfuse/shared";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

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

    const inputKeys = Object.keys(input);

    // For each variable, increment its count if it exists in this item
    for (const variable of variables) {
      if (inputKeys.includes(variable)) {
        variableMap[variable] = (variableMap[variable] || 0) + 1;
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
      }),
    )
    .output(ConfigResponse)
    .query(async ({ input, ctx }) => {
      throwIfNoEntitlement({
        entitlement: "prompt-experiments",
        projectId: input.projectId,
        sessionUser: ctx.session.user,
      });
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

      if (!Boolean(extractedVariables.length)) {
        return {
          isValid: false,
          message: "Selected prompt has no variables.",
        };
      }

      const datasetItems = await ctx.prisma.datasetItem.findMany({
        where: {
          datasetId: input.datasetId,
          projectId: input.projectId,
        },
      });

      if (!Boolean(datasetItems.length)) {
        return {
          isValid: false,
          message: "Selected dataset is empty.",
        };
      }

      const variablesMap = validateDatasetItems(
        datasetItems,
        extractedVariables,
      );

      if (!Boolean(Object.keys(variablesMap).length)) {
        return {
          isValid: false,
          message: "No dataset item contains any variables.",
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
      throwIfNoEntitlement({
        entitlement: "prompt-experiments",
        projectId: input.projectId,
        sessionUser: ctx.session.user,
      });
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
