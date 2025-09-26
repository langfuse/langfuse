import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  type ChatMessage,
  ChatMessageType,
  fetchLLMCompletion,
  logger,
  type TraceParams,
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

        const getEnvironment = (): string => {
          if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) return "dev";

          switch (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
            case "US":
            case "EU":
            case "HIPAA":
              return "prod";
            case "STAGING":
              return "staging";
            default:
              return "dev";
          }
        };

        const traceParams: TraceParams = {
          environment: getEnvironment(),
          traceName: "natural-language-filter",
          traceId: randomBytes(16).toString("hex"),
          projectId: input.projectId,
          authCheck: {
            validKey: true as const,
            scope: {
              projectId: input.projectId,
              accessLevel: "project",
            } as any,
          },
        };

        const client = getLangfuseClient(
          env.LANGFUSE_AI_FEATURES_PUBLIC_KEY as string,
          env.LANGFUSE_AI_FEATURES_SECRET_KEY as string,
          env.LANGFUSE_AI_FEATURES_HOST,
        );

        const promptResponse = await client.getPrompt(
          "get-filter-conditions-from-query",
          undefined,
          { type: "chat" },
        );

        const messages = promptResponse.compile({ userPrompt: input.prompt });
        const modelParams = getDefaultModelParams();

        const llmCompletion = await fetchLLMCompletion({
          messages: messages.map((m: ChatMessage) => ({
            ...m,
            type: ChatMessageType.PublicAPICreated,
          })),
          modelParams,
          apiKey: BEDROCK_USE_DEFAULT_CREDENTIALS,
          streaming: false,
          traceParams,
          context: {
            tracing: "langfuse",
            credentials: "langfuse",
          },
        });

        await llmCompletion.processTracedEvents();

        logger.info(
          `LLM completion received: ${JSON.stringify(llmCompletion.completion, null, 2)}`,
        );

        const parsedFilters = parseFiltersFromCompletion(
          llmCompletion.completion as string,
        );

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
          message: "Failed to create natural language filter completion",
        });
      }
    }),
});
