import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
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
import { randomBytes } from "crypto";

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
          `Natural language filter completion request received:\n${JSON.stringify(input, null, 2)}`,
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

        // Setup tracing for natural language filters
        const traceParams = {
          environment: "langfuse-natural-language-filters" as const,
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

        // Use fetchLLMCompletion directly with hardcoded Bedrock config
        const llmCompletion = await fetchLLMCompletion({
          messages: input.messages.map((m) => ({
            ...m,
            type: ChatMessageType.PublicAPICreated,
          })),
          modelParams: {
            ...input.modelParams,
            adapter: LLMAdapter.Bedrock, // Hardcoded to Bedrock
          },
          apiKey: JSON.stringify(bedrockCredentials),
          config: bedrockConfig,
          streaming: false,
          traceParams,
        });

        // Process traced events for observability
        await llmCompletion.processTracedEvents();

        return llmCompletion.completion;
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
