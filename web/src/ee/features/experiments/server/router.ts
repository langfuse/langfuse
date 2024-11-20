import { z } from "zod";
import { randomUUID } from "crypto";
import {
  type ExperimentMetadata,
  QueueJobs,
  QueueName,
  redis,
  ZodModelConfig,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { extractVariables } from "@/src/utils/string";
import { PromptType } from "@/src/features/prompts/server/utils/validation";
import { type DatasetItem } from "@langfuse/shared";
import { ExperimentCreateQueue } from "../../../../../../packages/shared/dist/src/server/redis/experimentQueue";

const ValidConfigResponse = z.object({
  isValid: z.literal(true),
  totalItems: z.number(),
  includesAll: z.number(),
  includesSome: z.number(),
  missing: z.number(),
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
) => {
  return datasetItems.reduce(
    (acc, { input }) => {
      if (!input) {
        return { ...acc, missing: acc.missing + 1 };
      }

      // keys not sufficent, need to ensure that the values assocaited to the keys are strings
      const inputKeys = Object.keys(input);
      const hasAllVariables = variables.every((v) => inputKeys.includes(v));
      const hasSomeVariables = variables.some((v) => inputKeys.includes(v));

      return {
        includesAll: acc.includesAll + Number(hasAllVariables),
        includesSome:
          acc.includesSome + Number(!hasAllVariables && hasSomeVariables),
        missing: acc.missing + Number(!hasAllVariables && !hasSomeVariables),
      };
    },
    { includesAll: 0, includesSome: 0, missing: 0 },
  );
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
      // throwIfNoEntitlement({
      //   entitlement: "model-based-evaluations",
      //   projectId: input.projectId,
      //   sessionUser: ctx.session.user,
      // });
      // throwIfNoProjectAccess({
      //   session: ctx.session,
      //   projectId: input.projectId,
      //   scope: "evalJob:read",
      // });

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

      const { includesAll, includesSome, missing } = validateDatasetItems(
        datasetItems,
        extractedVariables,
      );

      if (missing === datasetItems.length) {
        return {
          isValid: false,
          message: "No dataset item contains all variables.",
        };
      }

      return {
        isValid: true,
        totalItems: datasetItems.length,
        includesAll,
        includesSome,
        missing,
      };
    }),

  createExperiment: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
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
      // throwIfNoEntitlement({
      //   entitlement: "model-based-evaluations",
      //   projectId: input.projectId,
      //   sessionUser: ctx.session.user,
      // });
      // throwIfNoProjectAccess({
      //   session: ctx.session,
      //   projectId: input.projectId,
      //   scope: "evalJob:read",
      // });

      // validate all dataset items exist??
      // TODO: must only pass the items that are valid. can either pass in data or validate here again?

      const metadata: ExperimentMetadata = {
        prompt_id: input.promptId,
        provider: input.modelConfig.provider,
        model: input.modelConfig.model,
        model_params: input.modelConfig.modelParams,
      };
      const name = `${input.promptId}-${new Date().toISOString()}`; // TODO: promptname-promptversion-timestamp

      const datasetRun = await ctx.prisma.datasetRuns.create({
        data: {
          name: name,
          description: input.description,
          datasetId: input.datasetId,
          metadata: metadata,
          projectId: input.projectId,
        },
      });

      if (redis && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
        const queue = ExperimentCreateQueue.getInstance();

        if (queue) {
          await queue.add(
            QueueName.ExperimentCreate,
            {
              name: QueueJobs.ExperimentCreateJob,
              id: randomUUID(),
              timestamp: new Date(),
              payload: {
                projectId: input.projectId,
                datasetId: input.datasetId,
                runId: datasetRun.id,
                description: input.description,
              },
            },
            {
              attempts: 3,
              backoff: {
                type: "exponential",
                delay: 0,
              },
            },
          );
        }
      }

      return { success: true, datasetId: input.datasetId };
    }),
});
