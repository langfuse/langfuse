import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { decrypt } from "@langfuse/shared/encryption";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { TRPCError } from "@trpc/server";
import {
  ChatMessageType,
  fetchLLMCompletion,
  logger,
} from "@langfuse/shared/src/server";
import { CreatePromptAssistantCompletion } from "../validation";
import { Langfuse } from "langfuse";
import { env } from "@/src/env.mjs";

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

        const systemPrompt = await langfuseClient.getPrompt("system-prompt");

        const messages = [
          {
            role: "system",
            content: systemPrompt.compile({
              currentPrompt: input.targetPrompt,
            }),
          },
        ];

        const llmApiKey = await ctx.prisma.llmApiKeys.findFirst({
          where: {
            projectId: input.projectId,
            provider: input.modelParams.provider,
          },
        });

        if (!llmApiKey)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `No ${input.modelParams.provider} API key found in project. Please add one in the project settings.`,
          });

        const llmCompletion = await fetchLLMCompletion({
          messages: messages.map((m) => ({
            ...m,
            type: ChatMessageType.PublicAPICreated,
          })),
          modelParams: input.modelParams,
          apiKey: decrypt(llmApiKey.secretKey),
          tools: [],
          streaming: false,
        });

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
