import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  type ChatMessage,
  ChatMessageType,
  logger,
  generateLangfuseAIText,
  getClientInitiatedNonStreamingLlmTimeoutMs,
  getLangfuseAITraceSinkParams,
  isLangfuseAITracingConfigured,
} from "@langfuse/shared/src/server";
import {
  getInAppAgentModelConfig,
  LANGFUSE_AI_MODEL_UNCONFIGURED_MESSAGE,
} from "@langfuse/shared/in-app-agent/server/modelProvider";
import { env } from "@/src/env.mjs";
import { CreateNaturalLanguageFilterCompletion } from "./validation";
import { parseFiltersFromCompletion, getLangfuseClient } from "./utils";
import { throwIfNoProjectAccess } from "@/src/features/rbac";

export const naturalLanguageFilterRouter = createTRPCRouter({
  createCompletion: protectedProjectProcedure
    .input(CreateNaturalLanguageFilterCompletion)
    .mutation(async ({ input, ctx }) => {
      try {
        // Generating a filter reads nothing a project member cannot already
        // read by hand, so membership is the right bar; whether the org uses
        // AI at all is governed by `aiFeaturesEnabled` below.
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "project:read",
        });

        // Leftover table-wand path: still Cloud-only. It needs the managed
        // `get-filter-conditions-from-query` prompt and has no bundled fallback.
        // v4 Ask AI (`searchBar.generateFilter`) is the self-hosted path.
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

        if (!getInAppAgentModelConfig()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: LANGFUSE_AI_MODEL_UNCONFIGURED_MESSAGE,
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

        // Tracing is optional: skip it when the AI-features project is not
        // configured (the default self-hosted case) rather than failing the
        // generation. Self-hosted cannot toggle `aiTelemetryEnabled` off.
        const aiTelemetryEnabled =
          project.organization.aiTelemetryEnabled &&
          isLangfuseAITracingConfigured();

        // Get current datetime in ISO format with day of week for AI context
        const now = new Date();
        const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
        const currentDatetime = `${dayOfWeek}, ${now.toISOString()}`;

        const messages = promptResponse.compile({
          userPrompt: input.prompt,
          currentDatetime,
        });
        const llmCompletion = await generateLangfuseAIText({
          messages: messages.map((m: ChatMessage) => ({
            ...m,
            type: ChatMessageType.PublicAPICreated,
          })),
          maxTokens: 1000,
          timeout: getClientInitiatedNonStreamingLlmTimeoutMs(),
          traceSinkParams: aiTelemetryEnabled
            ? getLangfuseAITraceSinkParams({
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
