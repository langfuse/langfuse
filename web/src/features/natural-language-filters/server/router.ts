import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { decrypt } from "@langfuse/shared/encryption";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { TRPCError } from "@trpc/server";
import {
  ChatMessageType,
  decryptAndParseExtraHeaders,
  fetchLLMCompletion,
  LLMAdapter,
  LLMApiKeySchema,
  logger,
} from "@langfuse/shared/src/server";
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

        // Get Bedrock API key from database
        // TODO: GET FROM ENV VAR
        const llmApiKeyDbRecord = await ctx.prisma.llmApiKeys.findFirst({
          where: {
            projectId: input.projectId,
            adapter: "bedrock",
          },
        });

        const parsedKey = LLMApiKeySchema.safeParse(llmApiKeyDbRecord);
        if (!parsedKey.success)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "No Bedrock API key found in project. Please add one in the project settings.",
          });

        const llmApiKey = parsedKey.data;

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
          apiKey: decrypt(llmApiKey.secretKey),
          extraHeaders: decryptAndParseExtraHeaders(llmApiKey.extraHeaders),
          baseURL: llmApiKey.baseURL || undefined,
          config: llmApiKey.config,
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
