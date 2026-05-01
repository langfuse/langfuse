import { z } from "zod";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  AuthMethod,
  CreateLlmApiKey,
  UpdateLlmApiKey,
  SafeLlmApiKeySchema,
  type BedrockAuthMethod,
} from "@/src/features/llm-api-key/types";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import {
  type ChatMessage,
  ChatMessageRole,
  supportedModels,
  GCPServiceAccountKeySchema,
  BedrockConfigSchema,
  BedrockCredentialSchema,
  VertexAIConfigSchema,
  BEDROCK_USE_DEFAULT_CREDENTIALS,
  VERTEXAI_USE_DEFAULT_CREDENTIALS,
  EvaluatorBlockReason,
  getEvaluatorBlockMetadata,
} from "@langfuse/shared";
import { encrypt, decrypt } from "@langfuse/shared/encryption";
import {
  ChatMessageType,
  fetchLLMCompletion,
  LLMAdapter,
  logger,
  decryptAndParseExtraHeaders,
  blockEvaluatorConfigsInTx,
  EvaluatorBlockSource,
  finalizeBlockedEvaluatorConfigBlocks,
  validateLlmConnectionBaseURL,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { TRPCError } from "@trpc/server";

export function getDisplaySecretKey(secretKey: string) {
  if (secretKey === BEDROCK_USE_DEFAULT_CREDENTIALS) {
    return "Default AWS credentials";
  }
  if (secretKey === VERTEXAI_USE_DEFAULT_CREDENTIALS) {
    return "Default GCP credentials (ADC)";
  }
  return secretKey.endsWith('"}')
    ? "..." + secretKey.slice(-6, -2)
    : "..." + secretKey.slice(-4);
}

export function validateBedrockSecretKey(secretKey: string) {
  if (secretKey === BEDROCK_USE_DEFAULT_CREDENTIALS) {
    return;
  }

  try {
    BedrockCredentialSchema.parse(JSON.parse(secretKey));
  } catch {
    throw new Error(
      "Invalid Bedrock credentials. Expected a JSON object with either {accessKeyId, secretAccessKey} or {apiKey}.",
    );
  }
}

function getBedrockAuthMethod(
  secretKey: string,
): BedrockAuthMethod | undefined {
  if (secretKey === BEDROCK_USE_DEFAULT_CREDENTIALS) {
    return AuthMethod.DefaultCredentials;
  }

  try {
    const parsed = BedrockCredentialSchema.parse(JSON.parse(secretKey));
    return parsed && "apiKey" in parsed
      ? AuthMethod.ApiKey
      : AuthMethod.AccessKeys;
  } catch (error) {
    logger.warn("Failed to derive Bedrock auth method from stored secret", {
      error,
    });
    return undefined;
  }
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
      // Skip validation if using ADC (Application Default Credentials)
      if (params.secretKey !== VERTEXAI_USE_DEFAULT_CREDENTIALS) {
        const parsed = GCPServiceAccountKeySchema.safeParse(
          JSON.parse(params.secretKey),
        );
        if (!parsed.success)
          throw Error("Invalid GCP service account JSON key");
      }
    }

    const testMessages: ChatMessage[] = [
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
      llmConnection: {
        secretKey: encrypt(params.secretKey),
        extraHeaders:
          params.extraHeaders && encrypt(JSON.stringify(params.extraHeaders)),
        baseURL: params.baseURL || undefined,
        config: parsedConfig,
      },
      messages: testMessages,
      streaming: false,
      maxRetries: 1,
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

async function validateBaseURLForWrite(params: {
  baseURL?: string | null;
  errorPrefix?: string;
}): Promise<void> {
  if (!params.baseURL) {
    return;
  }

  try {
    await validateLlmConnectionBaseURL(params.baseURL);
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error instanceof Error
          ? `${params.errorPrefix ?? "Invalid base URL"}: ${error.message}`
          : (params.errorPrefix ?? "Invalid base URL"),
    });
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

        await validateBaseURLForWrite({
          baseURL: input.baseURL,
        });

        // Validate that default credentials sentinel is only allowed for Bedrock/VertexAI in self-hosted deployments
        const isLangfuseCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

        if (input.secretKey === BEDROCK_USE_DEFAULT_CREDENTIALS) {
          if (isLangfuseCloud || input.adapter !== LLMAdapter.Bedrock) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Default AWS credentials are only allowed for Bedrock in self-hosted deployments.",
            });
          }
        }

        if (input.adapter === LLMAdapter.Bedrock) {
          try {
            validateBedrockSecretKey(input.secretKey);
          } catch (e) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                e instanceof Error ? e.message : "Invalid Bedrock credentials.",
            });
          }
        }

        if (input.secretKey === VERTEXAI_USE_DEFAULT_CREDENTIALS) {
          if (isLangfuseCloud || input.adapter !== LLMAdapter.VertexAI) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Default GCP credentials (ADC) are only allowed for Vertex AI in self-hosted deployments.",
            });
          }
        }

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

      const result = await ctx.prisma.$transaction(async (tx) => {
        // Check if the llm api key is used for the default evaluation model
        const defaultModel = await tx.defaultLlmModel.findFirst({
          where: {
            projectId: input.projectId,
          },
          select: {
            llmApiKeyId: true,
          },
        });

        const providerBlockedJobConfigIds = new Set<string>();
        const defaultModelBlockedJobConfigIds = new Set<string>();

        if (llmApiKey?.provider) {
          const evalTemplates = await tx.evalTemplate.findMany({
            where: {
              OR: [{ projectId: input.projectId }, { projectId: null }],
              provider: llmApiKey.provider,
            },
            select: {
              id: true,
            },
          });

          const providerBlockResult = await blockEvaluatorConfigsInTx({
            tx,
            projectId: input.projectId,
            where: {
              evalTemplateId: {
                in: evalTemplates.map((template) => template.id),
              },
            },
            blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
            blockMessage: getEvaluatorBlockMetadata(
              EvaluatorBlockReason.LLM_CONNECTION_MISSING,
            ).message,
          });

          for (const configId of providerBlockResult.blockedJobConfigIds) {
            providerBlockedJobConfigIds.add(configId);
          }
        }

        if (!!defaultModel && defaultModel.llmApiKeyId === llmApiKey?.id) {
          const evalTemplates = await tx.evalTemplate.findMany({
            where: {
              OR: [{ projectId: input.projectId }, { projectId: null }],
              provider: null,
              model: null,
            },
            select: {
              id: true,
            },
          });

          const defaultModelBlockResult = await blockEvaluatorConfigsInTx({
            tx,
            projectId: input.projectId,
            where: {
              evalTemplateId: {
                in: evalTemplates.map((template) => template.id),
              },
            },
            blockReason: EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING,
            blockMessage: getEvaluatorBlockMetadata(
              EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING,
            ).message,
          });

          for (const configId of defaultModelBlockResult.blockedJobConfigIds) {
            defaultModelBlockedJobConfigIds.add(configId);
          }
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

        return {
          providerBlockedJobConfigIds: Array.from(providerBlockedJobConfigIds),
          defaultModelBlockedJobConfigIds: Array.from(
            defaultModelBlockedJobConfigIds,
          ),
        };
      });

      await finalizeBlockedEvaluatorConfigBlocks({
        projectId: input.projectId,
        source: EvaluatorBlockSource.LLM_API_KEY_DELETION,
        blockedByReason: {
          [EvaluatorBlockReason.LLM_CONNECTION_MISSING]:
            result.providerBlockedJobConfigIds,
          [EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING]:
            result.defaultModelBlockedJobConfigIds,
        },
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

      const storedApiKeys = await ctx.prisma.llmApiKeys.findMany({
        // secretKey is selected server-side only to derive a safe auth-method enum for Bedrock
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
          config: true,
          secretKey: true,
        },
        where: {
          projectId: input.projectId,
        },
      });

      const apiKeys = z.array(SafeLlmApiKeySchema).parse(
        storedApiKeys.map(({ secretKey, ...apiKey }) => ({
          ...apiKey,
          secretKey: undefined,
          extraHeaders: undefined,
          authMethod:
            apiKey.adapter === LLMAdapter.Bedrock
              ? getBedrockAuthMethod(decrypt(secretKey))
              : undefined,
        })),
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
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:create",
      });

      if (input.baseURL) {
        try {
          await validateLlmConnectionBaseURL(input.baseURL);
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Invalid base URL",
          };
        }
      }

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
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "llmApiKeys:update",
      });

      try {
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

        const hasNewSecretKey =
          typeof input.secretKey === "string" && input.secretKey.length > 0;
        const baseURL = input.baseURL ?? existingKey.baseURL;
        const isBaseURLChanged = baseURL !== existingKey.baseURL;

        if (isBaseURLChanged && !hasNewSecretKey) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Secret key is required when changing the base URL",
          });
        }

        if (input.baseURL && isBaseURLChanged) {
          await validateLlmConnectionBaseURL(input.baseURL);
        }

        const secretKey = hasNewSecretKey
          ? (input.secretKey as string)
          : decrypt(existingKey.secretKey);

        // Merge existing key with provided input, giving priority to input
        const adapter = input.adapter ?? (existingKey.adapter as LLMAdapter);
        const provider = input.provider ?? existingKey.provider;
        const customModels = input.customModels ?? existingKey.customModels;
        const config = input.config ?? existingKey.config;

        // Never reuse stored headers across a destination change.
        const extraHeaders =
          input.extraHeaders !== undefined
            ? input.extraHeaders
            : isBaseURLChanged
              ? undefined
              : existingKey.extraHeaders
                ? decryptAndParseExtraHeaders(existingKey.extraHeaders)
                : undefined;

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

        // Validate that default credentials sentinel is only allowed for Bedrock/VertexAI in self-hosted deployments
        const isLangfuseCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);
        const isBaseURLChanged =
          input.baseURL !== undefined
            ? input.baseURL !== existingKey.baseURL
            : false;

        if (input.baseURL && isBaseURLChanged) {
          await validateBaseURLForWrite({
            baseURL: input.baseURL,
          });
        }

        if (input.secretKey === BEDROCK_USE_DEFAULT_CREDENTIALS) {
          if (isLangfuseCloud || input.adapter !== LLMAdapter.Bedrock) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Default AWS credentials are only allowed for Bedrock in self-hosted deployments.",
            });
          }
        }

        if (input.secretKey && input.adapter === LLMAdapter.Bedrock) {
          try {
            validateBedrockSecretKey(input.secretKey);
          } catch (e) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                e instanceof Error ? e.message : "Invalid Bedrock credentials.",
            });
          }
        }

        if (input.secretKey === VERTEXAI_USE_DEFAULT_CREDENTIALS) {
          if (isLangfuseCloud || input.adapter !== LLMAdapter.VertexAI) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Default GCP credentials (ADC) are only allowed for Vertex AI in self-hosted deployments.",
            });
          }
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
