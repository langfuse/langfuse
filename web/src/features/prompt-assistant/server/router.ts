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
  LLMApiKeySchema,
  logger,
} from "@langfuse/shared/src/server";
import { CreatePromptAssistantCompletion } from "../validation";
import { Langfuse } from "langfuse";
import { env } from "@/src/env.mjs";
import { randomBytes } from "crypto";

let langfuseClient: Langfuse | null = null;

if (
  env.LANGFUSE_PROMPT_ASSISTANT_PROJECT_PUBLIC_KEY &&
  env.LANGFUSE_PROMPT_ASSISTANT_PROJECT_SECRET_KEY
) {
  langfuseClient = new Langfuse({
    publicKey: env.LANGFUSE_PROMPT_ASSISTANT_PROJECT_PUBLIC_KEY,
    secretKey: env.LANGFUSE_PROMPT_ASSISTANT_PROJECT_SECRET_KEY,
    baseUrl: env.LANGFUSE_PROMPT_ASSISTANT_PROJECT_HOST,
  });
}

export const promptAssistantRouter = createTRPCRouter({
  createCompletion: protectedProjectProcedure
    .input(CreatePromptAssistantCompletion)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        logger.info(
          `Prompt Assistant completion request received:\n${JSON.stringify(input, null, 2)}`,
        );

        if (!langfuseClient) throw Error("Feature not configured.");

        const systemPrompt = await langfuseClient.getPrompt(
          "system-prompt-chatml",
          undefined,
          { type: "chat" },
        );

        const messages = [
          ...systemPrompt.compile({
            currentPrompt: input.targetPrompt,
          }),
          ...input.messages,
        ];

        const llmApiKeyDbRecord = await ctx.prisma.llmApiKeys.findFirst({
          where: {
            projectId: input.projectId,
            provider: input.modelParams.provider,
          },
        });

        const parsedKey = LLMApiKeySchema.safeParse(llmApiKeyDbRecord);
        if (!parsedKey.success)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `No ${input.modelParams.provider} API key found in project. Please add one in the project settings.`,
          });

        const llmApiKey = parsedKey.data;

        const traceParams = {
          environment: "langfuse-prompt-assistant" as const,
          traceName: "langfuse-prompt-assistant",
          traceId: randomBytes(16).toString("hex"),
          projectId: input.projectId,
          authCheck: {
            validKey: true as const,
            scope: {
              projectId: env.LANGFUSE_PROMPT_ASSISTANT_PROJECT_ID,
              accessLevel: "project",
            } as any,
          },
        };

        const llmCompletion = await fetchLLMCompletion({
          messages: messages.map((m) => ({
            ...m,
            type: ChatMessageType.PublicAPICreated,
          })),
          modelParams: input.modelParams,
          apiKey: decrypt(llmApiKey.secretKey),
          extraHeaders: decryptAndParseExtraHeaders(llmApiKey.extraHeaders),
          baseURL: llmApiKey.baseURL || undefined,
          config: llmApiKey.config,
          tools: [],
          streaming: false,
          traceParams,
        });

        await llmCompletion.processTracedEvents();

        return llmCompletion.completion;
      } catch (error) {
        logger.error("Failed to create prompt assistant completion: ", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create prompt assistant completion",
        });
      }
    }),
});
