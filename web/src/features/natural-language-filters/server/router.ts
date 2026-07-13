import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  type ChatMessage,
  ChatMessageType,
  LangfuseInternalTraceEnvironment,
  logger,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { CreateNaturalLanguageFilterCompletion } from "./validation";
import { parseFiltersFromCompletion, getLangfuseClient } from "./utils";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  fetchLangfuseAICompletion,
  getLangfuseAITraceSinkParams,
  isLangfuseAITracingConfigured,
} from "@/src/features/ai-features/server/bedrockCompletion";

export const naturalLanguageFilterRouter = createTRPCRouter({
  createCompletion: protectedProjectProcedure
    .input(CreateNaturalLanguageFilterCompletion)
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
              "Natural language filtering is not available in self-hosted deployments.",
          });
        }

        const project = await ctx.prisma.project.findUnique({
          where: { id: input.projectId },
          select: {
            organization: {
              select: {
                aiFeaturesEnabled: true,
                aiTelemetryEnabled: true,
              },
            },
          },
        });

        if (!project) {
          logger.warn("Project not found when resolving AI telemetry setting", {
            projectId: input.projectId,
          });
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Project not found.",
          });
        }

        if (!project.organization.aiFeaturesEnabled) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Natural language filtering is not enabled for this organization.",
          });
        }

        if (!env.LANGFUSE_AWS_BEDROCK_MODEL) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Bedrock environment variables not configured. Please set LANGFUSE_AWS_BEDROCK_* variables.",
          });
        }

        if (
          !env.LANGFUSE_AI_FEATURES_PUBLIC_KEY ||
          !env.LANGFUSE_AI_FEATURES_SECRET_KEY
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Langfuse AI filters environment variables not configured. Please set LANGFUSE_AI_FEATURES_PUBLIC_KEY and LANGFUSE_AI_FEATURES_SECRET_KEY variables.",
          });
        }

        const client = getLangfuseClient(
          env.LANGFUSE_AI_FEATURES_PUBLIC_KEY,
          env.LANGFUSE_AI_FEATURES_SECRET_KEY,
          env.LANGFUSE_AI_FEATURES_HOST,
          false,
        );

        const promptResponse = await client.getPrompt(
          "get-filter-conditions-from-query",
          undefined,
          { type: "chat" },
        );

        const aiTelemetryEnabled = project.organization.aiTelemetryEnabled;

        if (aiTelemetryEnabled && !isLangfuseAITracingConfigured()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Langfuse AI Features not configured.",
          });
        }

        // Get current datetime in ISO format with day of week for AI context
        const now = new Date();
        const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
        const currentDatetime = `${dayOfWeek}, ${now.toISOString()}`;

        const messages = promptResponse.compile({
          userPrompt: input.prompt,
          currentDatetime,
        });
        const llmCompletion = await fetchLangfuseAICompletion({
          messages: messages.map((m: ChatMessage) => ({
            ...m,
            type: ChatMessageType.PublicAPICreated,
          })),
          maxTokens: 1000,
          traceSinkParams: aiTelemetryEnabled
            ? getLangfuseAITraceSinkParams({
                environment:
                  LangfuseInternalTraceEnvironment.NaturalLanguageFilter,
                feature: "natural-language-filter",
                projectId: ctx.session.projectId,
                traceName: "natural-language-filter",
                userId: ctx.session.user.id,
                metadata: {
                  langfuse_user_id: ctx.session.user.id,
                  ...(ctx.session.user.email
                    ? { langfuse_user_email: ctx.session.user.email }
                    : {}),
                  langfuse_user_project_role: ctx.session.projectRole,
                  langfuse_cloud_region: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
                },
                prompt: promptResponse,
              })
            : undefined,
        });

        logger.info(
          `LLM completion received: ${JSON.stringify(llmCompletion, null, 2)}`,
        );

        if (typeof llmCompletion !== "string") {
          throw new Error("Expected LLM completion to be a string");
        }

        const parsedFilters = parseFiltersFromCompletion(llmCompletion);

        return {
          filters: parsedFilters,
        };
      } catch (error) {
        logger.error(
          "Failed to create natural language filter completion: ",
          error,
        );

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "The AI backend currently appears to be unavailable. Please try again later.",
        });
      }
    }),
});
