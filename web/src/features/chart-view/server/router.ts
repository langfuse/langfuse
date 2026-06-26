import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { fetchLLMCompletion, logger } from "@langfuse/shared/src/server";
import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { env } from "@/src/env.mjs";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { getDefaultModelParams } from "@/src/features/natural-language-filters/server/utils";
import {
  buildChartCompletionMessages,
  chartCompletionSchema,
} from "./chartCompletion";

/**
 * "Ask AI → chart": the sibling of `naturalLanguageFilters.createCompletion`
 * that emits a chart spec instead of a filter list. Same cloud-only +
 * `aiFeaturesEnabled` + Bedrock gating; uses an inline prompt + structured
 * output (the chart vocabulary is fixed) rather than a managed remote prompt.
 * Returns the raw spec — the client clamps it through `coerceConfig`.
 */
export const chartViewRouter = createTRPCRouter({
  generateChartConfig: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        prompt: z.string().min(1).max(2048),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Ask AI for charts is not available in self-hosted deployments.",
          });
        }

        const project = await ctx.prisma.project.findUnique({
          where: { id: input.projectId },
          select: { organization: { select: { aiFeaturesEnabled: true } } },
        });

        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Project not found.",
          });
        }

        if (!project.organization.aiFeaturesEnabled) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "AI features are not enabled for this organization.",
          });
        }

        if (!env.LANGFUSE_AWS_BEDROCK_MODEL) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Bedrock environment variables not configured. Please set LANGFUSE_AWS_BEDROCK_* variables.",
          });
        }

        const now = new Date();
        const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
        const currentDatetime = `${dayOfWeek}, ${now.toISOString()}`;

        const completion = await fetchLLMCompletion({
          messages: buildChartCompletionMessages({
            prompt: input.prompt,
            currentDatetime,
          }),
          modelParams: getDefaultModelParams(),
          llmConnection: {
            secretKey: encrypt(BEDROCK_USE_DEFAULT_CREDENTIALS),
          },
          streaming: false,
          structuredOutputSchema: chartCompletionSchema,
          shouldUseLangfuseAPIKey: true,
        });

        // Structured output is already schema-shaped; re-validate to be safe.
        const config = chartCompletionSchema.parse(completion);
        return { config };
      } catch (error) {
        // Already-shaped rejections (FORBIDDEN / PRECONDITION_FAILED / NOT_FOUND
        // / RBAC) are expected control flow, not backend faults — rethrow them
        // without ERROR-level noise. Only unexpected errors get logged + masked.
        if (error instanceof TRPCError) throw error;
        logger.error("Failed to generate chart config from prompt", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "The AI backend currently appears to be unavailable. Please try again later.",
        });
      }
    }),
});
