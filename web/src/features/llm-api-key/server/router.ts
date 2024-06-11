import { z } from "zod";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { CreateLlmApiKey } from "@/src/features/llm-api-key/types";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  type ChatMessage,
  LLMApiKeySchema,
  fetchLLMCompletion,
  ChatMessageRole,
  supportedModels,
} from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { isEeEnabled } from "@/src/ee/utils/isEeEnabled";

export function getDisplaySecretKey(secretKey: string) {
  return "..." + secretKey.slice(-4);
}

export const llmApiKeyRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      try {
        if (!isEeEnabled) {
          throw new Error(
            "LLM API keys are only required for model-based evaluations and the playground. Both are not yet available in the v2 open-source version.",
          );
        }
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmApiKeys:create",
        });

        const key = await ctx.prisma.llmApiKeys.create({
          data: {
            projectId: input.projectId,
            secretKey: encrypt(input.secretKey),
            adapter: input.adapter,
            displaySecretKey: getDisplaySecretKey(input.secretKey),
            provider: input.provider,
            baseURL: input.baseURL,
            withDefaultModels: input.withDefaultModels,
            customModels: input.customModels,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "llmApiKey",
          resourceId: key.id,
          action: "create",
        });
      } catch (e) {
        console.log(e);
        throw e;
      }
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!isEeEnabled) {
        throw new Error(
          "LLM API keys are only required for model-based evaluations and the playground. Both are not yet available in the v2 open-source version.",
        );
      }
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:delete",
      });

      await ctx.prisma.llmApiKeys.delete({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "llmApiKey",
        resourceId: input.id,
        action: "delete",
      });
    }),
  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!isEeEnabled) {
        throw new Error(
          "LLM API keys are only required for model-based evaluations and the playground. Both are not yet available in the v2 open-source version.",
        );
      }

      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:read",
      });

      const apiKeys = z
        .array(LLMApiKeySchema.extend({ secretKey: z.undefined() }))
        .parse(
          await ctx.prisma.llmApiKeys.findMany({
            // we must not return the secret key via the API, hence not selected
            select: {
              id: true,
              createdAt: true,
              updatedAt: true,
              provider: true,
              displaySecretKey: true,
              projectId: true,
              adapter: true,
              baseURL: true,
              customModels: true,
              withDefaultModels: true,
            },
            where: {
              projectId: input.projectId,
            },
          }),
        );

      const count = await ctx.prisma.llmApiKeys.count({
        where: {
          projectId: input.projectId,
        },
      });

      return {
        data: apiKeys, // does not contain the secret key
        totalCount: count,
      };
    }),

  test: protectedProjectProcedure
    .input(CreateLlmApiKey)
    .mutation(async ({ input }) => {
      if (!isEeEnabled) {
        throw new Error(
          "LLM API keys are only required for model-based evaluations and the playground. Both are not yet available in the v2 open-source version.",
        );
      }

      try {
        const model = input.customModels?.length
          ? input.customModels[0]
          : supportedModels[input.adapter][0];

        if (!model) throw Error("No model found");

        const testMessages: ChatMessage[] = [
          { role: ChatMessageRole.System, content: "You are a bot" },
          { role: ChatMessageRole.User, content: "How are you?" },
        ];

        await fetchLLMCompletion({
          modelParams: {
            adapter: input.adapter,
            provider: input.provider,
            model,
          },
          baseURL: input.baseURL,
          apiKey: input.secretKey,
          messages: testMessages,
          streaming: false,
          maxRetries: 1,
        });

        return { success: true };
      } catch (err) {
        console.log(err);

        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }),
});
