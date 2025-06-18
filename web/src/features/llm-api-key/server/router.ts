import { z } from "zod/v4";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  CreateLlmApiKey,
  UpdateLlmApiKey,
} from "@/src/features/llm-api-key/types";
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
  BedrockConfigSchema,
  VertexAIConfigSchema,
} from "@langfuse/shared";
import { encrypt, decrypt } from "@langfuse/shared/encryption";
import {
  ChatMessageType,
  fetchLLMCompletion,
  LLMAdapter,
  logger,
  decryptAndParseExtraHeaders,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { TRPCError } from "@trpc/server";

export function getDisplaySecretKey(secretKey: string) {
  return secretKey.endsWith('"}')
    ? "..." + secretKey.slice(-6, -2)
    : "..." + secretKey.slice(-4);
}

type TestLLMConnectionParams = {
  adapter: LLMAdapter;
  provider: string;
  secretKey: string;
  baseURL?: string | null;
  customModels?: string[];
  extraHeaders?: Record<string, string>;
  config?: unknown;
};

async function testLLMConnection(
  params: TestLLMConnectionParams,
): Promise<{ success: boolean; error?: string }> {
  try {
    const model = params.customModels?.length
      ? params.customModels[0]
      : supportedModels[params.adapter][0];

    if (!model) throw Error("No model found");

    if (params.adapter === LLMAdapter.VertexAI) {
      const parsed = GCPServiceAccountKeySchema.safeParse(
        JSON.parse(params.secretKey),
      );
      if (!parsed.success) throw Error("Invalid GCP service account JSON key");
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

    // Parse config properly for type safety
    let parsedConfig: Record<string, string> | null = null;
    if (params.config && params.adapter === LLMAdapter.Bedrock) {
      const bedrockConfig = BedrockConfigSchema.parse(params.config);
      parsedConfig = { region: bedrockConfig.region };
    } else if (params.config && params.adapter === LLMAdapter.VertexAI) {
      const vertexAIConfig = VertexAIConfigSchema.parse(params.config);
      parsedConfig = vertexAIConfig.location
        ? { location: vertexAIConfig.location }
        : null;
    }

    await fetchLLMCompletion({
      modelParams: {
        adapter: params.adapter,
        provider: params.provider,
        model,
      },
      baseURL: params.baseURL || undefined,
      apiKey: params.secretKey,
      extraHeaders: params.extraHeaders,
      messages: testMessages,
      streaming: false,
      maxRetries: 1,
      config: parsedConfig,
    });

    return { success: true };
  } catch (err) {
    logger.error(err);

    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
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
      return testLLMConnection({
        adapter: input.adapter,
        provider: input.provider,
        secretKey: input.secretKey,
        baseURL: input.baseURL,
        customModels: input.customModels,
        extraHeaders: input.extraHeaders,
        config: input.config,
      });
    }),

  testUpdate: protectedProjectProcedureWithoutTracing
    .input(UpdateLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmApiKeys:read",
        });

        // Get the existing key from the database
        const existingKey = await ctx.prisma.llmApiKeys.findUnique({
          where: {
            id: input.id,
            projectId: input.projectId,
          },
        });

        if (!existingKey) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "API key not found",
          });
        }

        const decryptedSecretKey =
          input.secretKey !== undefined &&
          input.secretKey !== "" &&
          input.secretKey !== null
            ? input.secretKey
            : decrypt(existingKey.secretKey);

        // Merge existing key with provided input, giving priority to input
        const secretKey = decryptedSecretKey;
        const adapter = input.adapter ?? (existingKey.adapter as LLMAdapter);
        const provider = input.provider ?? existingKey.provider;
        const baseURL = input.baseURL ?? existingKey.baseURL;
        const customModels = input.customModels ?? existingKey.customModels;
        const config = input.config ?? existingKey.config;
        const extraHeaders =
          input.extraHeaders ??
          (existingKey.extraHeaders
            ? decryptAndParseExtraHeaders(existingKey.extraHeaders)
            : undefined);

        return testLLMConnection({
          adapter,
          provider,
          secretKey,
          baseURL,
          customModels,
          extraHeaders,
          config,
        });
      } catch (err) {
        logger.error(err);

        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }),

  update: protectedProjectProcedureWithoutTracing
    .input(UpdateLlmApiKey)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "llmApiKeys:update",
        });

        // Get existing key to verify provider and adapter
        const existingKey = await ctx.prisma.llmApiKeys.findUnique({
          where: {
            id: input.id,
            projectId: input.projectId,
          },
        });

        if (!existingKey) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "API key not found",
          });
        }

        // Ensure provider and adapter cannot be changed
        if (
          input.provider !== existingKey.provider ||
          input.adapter !== existingKey.adapter
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Provider and adapter cannot be changed",
          });
        }

        // Ensure we delete extra headers if they existed before and were removed
        if (input.extraHeaders === undefined && existingKey.extraHeaders) {
          input.extraHeaders = {};
        }

        // Get existing decrypted headers for comparison
        const decryptedHeaders = existingKey.extraHeaders
          ? decryptAndParseExtraHeaders(existingKey.extraHeaders)
          : null;
        const existingHeaders: Record<string, string> = decryptedHeaders ?? {};

        // Ensure we only update the extraHeaders where the value is not null
        let extraHeaders: Record<string, string> | undefined;

        if (input.extraHeaders === undefined) {
          // Keep all existing headers unchanged
          extraHeaders =
            Object.keys(existingHeaders).length > 0
              ? existingHeaders
              : undefined;
        } else {
          // Process input headers, preserving existing values for empty inputs
          extraHeaders = {};

          for (const [key, value] of Object.entries(input.extraHeaders)) {
            if (value === null || value === undefined || value === "") {
              // Keep existing value if input value is empty and key exists
              if (existingHeaders[key] !== undefined) {
                extraHeaders[key] = existingHeaders[key];
              }
            } else {
              // Use the new non-empty value
              extraHeaders[key] = value;
            }
          }

          // If no headers remain, set to undefined
          if (Object.keys(extraHeaders).length === 0) {
            extraHeaders = undefined;
          }
        }

        const key = await ctx.prisma.llmApiKeys.update({
          where: { id: input.id },
          data: {
            ...(input.secretKey ? { secretKey: encrypt(input.secretKey) } : {}),
            extraHeaders: extraHeaders
              ? encrypt(JSON.stringify(extraHeaders))
              : undefined,
            extraHeaderKeys: extraHeaders
              ? Object.keys(extraHeaders)
              : undefined,
            displaySecretKey: input.secretKey
              ? getDisplaySecretKey(input.secretKey)
              : undefined,
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
          action: "update",
        });
      } catch (e) {
        logger.error(e);
        throw e;
      }
    }),
});
