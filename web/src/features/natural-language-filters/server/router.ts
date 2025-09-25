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
  buildPromptMessages,
  getDefaultModelParams,
  parseFiltersFromCompletion,
} from "./utils";
import { randomBytes } from "crypto";
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

        logger.info(
          `Natural language filter completion request received for project ${input.projectId}: "${input.prompt}"`,
        );

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

        const messages = buildPromptMessages(input.prompt);
        const modelParams = getDefaultModelParams();

        // Use fetchLLMCompletion directly with hardcoded Bedrock config
        const llmCompletion = await fetchLLMCompletion({
          messages: messages.map((m) => ({
            ...m,
            type: ChatMessageType.PublicAPICreated,
          })),
          modelParams: {
            ...modelParams,
            adapter: LLMAdapter.Bedrock, // Hardcoded to Bedrock
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

        // Parse the completion using utility function
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
