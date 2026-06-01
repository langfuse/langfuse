import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  type ChatMessage,
  ChatMessageType,
  fetchLLMCompletion,
  LangfuseInternalTraceEnvironment,
  logger,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { CreateNaturalLanguageFilterCompletion } from "./validation";
import {
  getDefaultModelParams,
  parseFiltersFromCompletion,
  getLangfuseClient,
} from "./utils";
import { randomBytes } from "crypto";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";

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
        const targetProjectId = aiTelemetryEnabled
          ? env.LANGFUSE_AI_FEATURES_PROJECT_ID
          : undefined;

        if (aiTelemetryEnabled && !targetProjectId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Langfuse AI Features not configured.",
          });
        }

        const traceSinkParams = targetProjectId
          ? {
              environment:
                LangfuseInternalTraceEnvironment.NaturalLanguageFilter,
              traceName: "natural-language-filter",
              traceId: randomBytes(16).toString("hex"),
              targetProjectId,
              userId: ctx.session.user.id,
              metadata: {
                langfuse_ai_feature: "natural-language-filter",
                langfuse_user_id: ctx.session.user.id,
                langfuse_project_id: ctx.session.projectId,
              },
              prompt: promptResponse,
            }
          : undefined;

        // Get current datetime in ISO format with day of week for AI context
        const now = new Date();
        const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
        const currentDatetime = `${dayOfWeek}, ${now.toISOString()}`;

        const messages = promptResponse.compile({
          userPrompt: input.prompt,
          currentDatetime,
        });
        const modelParams = getDefaultModelParams();

        const llmCompletion = await fetchLLMCompletion({
          messages: messages.map((m: ChatMessage) => ({
            ...m,
            type: ChatMessageType.PublicAPICreated,
          })),
          modelParams,
          llmConnection: {
            secretKey: encrypt(BEDROCK_USE_DEFAULT_CREDENTIALS),
          },
          streaming: false,
          traceSinkParams,
          shouldUseLangfuseAPIKey: true,
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
