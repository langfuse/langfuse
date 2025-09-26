import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  ChatMessageType,
  fetchLLMCompletion,
  LLMAdapter,
  logger,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { BedrockConfigSchema, BedrockCredentialSchema } from "@langfuse/shared";
import { CreateNaturalLanguageFilterCompletion } from "./validation";
import {
  getDefaultModelParams,
  parseFiltersFromCompletion,
  getLangfuseClient,
} from "./utils";
import { randomBytes } from "crypto";
import { Langfuse } from "langfuse";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

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

        if (
          !env.LANGFUSE_AWS_BEDROCK_REGION ||
          !env.LANGFUSE_AWS_BEDROCK_ACCESS_KEY_ID ||
          !env.LANGFUSE_AWS_BEDROCK_SECRET_ACCESS_KEY
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Bedrock environment variables not configured. Please set LANGFUSE_AWS_BEDROCK_* variables.",
          });
        }

        if (
          !env.LANGFUSE_TRACING_AI_FILTERS_PK ||
          !env.LANGFUSE_TRACING_AI_FILTERS_SK
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Langfuse AI filters environment variables not configured. Please set LANGFUSE_TRACING_AI_FILTERS_PK and LANGFUSE_TRACING_AI_FILTERS_SK variables.",
          });
        }

        const bedrockCredentials = BedrockCredentialSchema.parse({
          accessKeyId: env.LANGFUSE_AWS_BEDROCK_ACCESS_KEY_ID,
          secretAccessKey: env.LANGFUSE_AWS_BEDROCK_SECRET_ACCESS_KEY,
        });

        const bedrockConfig = BedrockConfigSchema.parse({
          region: env.LANGFUSE_AWS_BEDROCK_REGION,
        });

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

        const traceParams = {
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
          env.LANGFUSE_TRACING_AI_FILTERS_PK as string,
          env.LANGFUSE_TRACING_AI_FILTERS_SK as string,
          env.LANGFUSE_TRACING_AI_FEATURES_HOST,
        );

        const promptResponse = await client.getPrompt(
          "get-filter-conditions-from-query",
        );

        const messages = promptResponse.compile({ userPrompt: input.prompt });
        const modelParams = getDefaultModelParams();

        const llmCompletion = await fetchLLMCompletion({
          messages: messages.map((m) => ({
            ...m,
            type: ChatMessageType.PublicAPICreated,
          })),
          modelParams: {
            ...modelParams,
            adapter: LLMAdapter.Bedrock,
          },
          apiKey: JSON.stringify(bedrockCredentials),
          config: bedrockConfig,
          streaming: false,
          traceParams,
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
