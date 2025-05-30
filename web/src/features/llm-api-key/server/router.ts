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
import { encrypt, decrypt } from "@langfuse/shared/encryption";
import {
  ChatMessageType,
  fetchLLMCompletion,
  LLMAdapter,
  logger,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { TRPCError } from "@trpc/server";

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

        if (!env.ENCRYPTION_KEY) {
          if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Internal server error",
            });
          } else {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Missing environment variable: `ENCRYPTION_KEY`. Please consult our docs: https://langfuse.com/self-hosting",
            });
          }
        }

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

      const llmApiKey = await ctx.prisma.llmApiKeys.findUnique({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });

      return ctx.prisma.$transaction(async (tx) => {
        // Check if the llm api key is used for the default evaluation model
        // If so, it will be deleted and we must invalidate all eval jobs that rely on it
        const defaultModel = await tx.defaultLlmModel.findFirst({
          where: {
            projectId: input.projectId,
          },
        });

        if (!!defaultModel && defaultModel.llmApiKeyId === llmApiKey?.id) {
          // Invalidate all eval jobs that rely on the default model
          const evalTemplates = await tx.evalTemplate.findMany({
            where: {
              OR: [{ projectId: input.projectId }, { projectId: null }],
              provider: null,
              model: null,
            },
          });

          await tx.jobConfiguration.updateMany({
            where: {
              evalTemplateId: { in: evalTemplates.map((et) => et.id) },
              projectId: input.projectId,
            },
            data: {
              status: "INACTIVE",
            },
          });
        }

        await tx.llmApiKeys.delete({
          where: {
            id: input.id,
            projectId: input.projectId,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "llmApiKey",
          resourceId: input.id,
          before: llmApiKey,
          action: "delete",
        });

        return { success: true };
      });
    }),
  update: protectedProjectProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
        customModels: z.array(z.string()).optional(),
        withDefaultModels: z.boolean().optional(),
        baseURL: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:update",
      });

      const existingKey = await ctx.prisma.llmApiKeys.findUnique({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });

      if (!existingKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "LLM API key not found",
        });
      }

      const updateData: any = {};

      if (input.customModels !== undefined) {
        updateData.customModels = input.customModels;
      }

      if (input.withDefaultModels !== undefined) {
        updateData.withDefaultModels = input.withDefaultModels;
      }

      if (input.baseURL !== undefined) {
        updateData.baseURL = input.baseURL;
      }

      const updated = await ctx.prisma.llmApiKeys.update({
        where: { id: input.id },
        data: updateData,
      });

      await auditLog({
        session: ctx.session,
        resourceType: "llmApiKey",
        resourceId: input.id,
        action: "update",
        before: existingKey,
        after: updated,
      });

      return { success: true };
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
          {
            role: ChatMessageRole.System,
            content: "You are a bot",
            type: ChatMessageType.System,
          },
          {
            role: ChatMessageRole.User,
            content: "How are you?",
            type: ChatMessageType.User,
          },
        ];

        await fetchLLMCompletion({
          modelParams: {
            adapter: input.adapter,
            provider: input.provider,
            model,
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
  testWithExistingKey: protectedProjectProcedureWithoutTracing
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(), // existing API key ID
        model: z.string(), // model name to test
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmApiKeys:update",
        });

        const existingKey = await ctx.prisma.llmApiKeys.findUnique({
          where: {
            id: input.id,
            projectId: input.projectId,
          },
        });

        if (!existingKey) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "LLM API key not found",
          });
        }

        const testMessages: ChatMessage[] = [
          {
            role: ChatMessageRole.System,
            content: "You are a bot",
            type: ChatMessageType.System,
          },
          {
            role: ChatMessageRole.User,
            content: "How are you?",
            type: ChatMessageType.User,
          },
        ];

        await fetchLLMCompletion({
          modelParams: {
            adapter: existingKey.adapter as LLMAdapter,
            provider: existingKey.provider,
            model: input.model,
          },
          baseURL: existingKey.baseURL || undefined,
          apiKey: decrypt(existingKey.secretKey),
          extraHeaders: existingKey.extraHeaders
            ? JSON.parse(decrypt(existingKey.extraHeaders))
            : undefined,
          messages: testMessages,
          streaming: false,
          maxRetries: 1,
          config: existingKey.config as any,
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
