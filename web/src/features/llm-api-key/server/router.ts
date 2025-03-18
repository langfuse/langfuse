import { z } from "zod";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { CreateLlmApiKey } from "@/src/features/llm-api-key/types";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import {
  type ChatMessage,
  LLMApiKeySchema,
  ChatMessageRole,
  supportedModels,
  GCPServiceAccountKeySchema,
} from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import {
  fetchLLMCompletion,
  LLMAdapter,
  logger,
} from "@langfuse/shared/src/server";

export function getDisplaySecretKey(secretKey: string) {
  return secretKey.endsWith('"}')
    ? "..." + secretKey.slice(-6, -2)
    : "..." + secretKey.slice(-4);
}

export const llmApiKeyRouter = createTRPCRouter({
  create: protectedProjectProcedureWithoutTracing
    .input(CreateLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmApiKeys:create",
        });

        const key = await ctx.prisma.llmApiKeys.create({
          data: {
            projectId: input.projectId,
            secretKey: encrypt(input.secretKey),
            extraHeaders: input.extraHeaders
              ? encrypt(JSON.stringify(input.extraHeaders))
              : undefined,
            extraHeaderKeys: input.extraHeaders
              ? Object.keys(input.extraHeaders)
              : undefined,
            adapter: input.adapter,
            displaySecretKey: getDisplaySecretKey(input.secretKey),
            provider: input.provider,
            baseURL: input.baseURL,
            withDefaultModels: input.withDefaultModels,
            customModels: input.customModels,
            config: input.config,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "llmApiKey",
          resourceId: key.id,
          action: "create",
        });
      } catch (e) {
        logger.error(e);
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
      throwIfNoProjectAccess({
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
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:read",
      });

      const apiKeys = z
        .array(
          LLMApiKeySchema.extend({
            secretKey: z.undefined(),
            extraHeaders: z.undefined(),
          }),
        )
        .parse(
          await ctx.prisma.llmApiKeys.findMany({
            // we must not return the secret key AND extra headers via the API, hence not selected
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
              extraHeaderKeys: true,
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

  test: protectedProjectProcedureWithoutTracing
    .input(CreateLlmApiKey)
    .mutation(async ({ input }) => {
      try {
        const model = input.customModels?.length
          ? input.customModels[0]
          : supportedModels[input.adapter][0];

        if (!model) throw Error("No model found");

        if (input.adapter === LLMAdapter.VertexAI) {
          const parsed = GCPServiceAccountKeySchema.safeParse(
            JSON.parse(input.secretKey),
          );
          if (!parsed.success)
            throw Error("Invalid GCP service account JSON key");
        }

        const testMessages: ChatMessage[] = [
          { role: ChatMessageRole.System, content: "You are a bot" },
          { role: ChatMessageRole.User, content: "How are you?" },
        ];

        await fetchLLMCompletion({
          modelParams: {
            adapter: input.adapter,
            provider: input.provider,
            model,
            top_p: 0.9, // Langchain sets 1 as default that is not supported HuggingFace
          },
          baseURL: input.baseURL,
          apiKey: input.secretKey,
          extraHeaders: input.extraHeaders,
          messages: testMessages,
          streaming: false,
          maxRetries: 1,
          config: input.config,
        });

        return { success: true };
      } catch (err) {
        logger.error(err);

        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }),
});
