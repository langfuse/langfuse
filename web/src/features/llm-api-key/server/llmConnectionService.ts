import { auditLog, type AuditLogActor } from "@/src/features/audit-logs/server";
import { env } from "@/src/env.mjs";
import {
  AuthMethod,
  type BedrockAuthMethod,
} from "@/src/features/llm-api-key/types";
import { getConnectionAvailableModels } from "@/src/features/llm-api-key/availableModels";
import {
  BEDROCK_USE_DEFAULT_CREDENTIALS,
  BedrockConfigSchema,
  BedrockCredentialSchema,
  ChatMessageRole,
  EvaluatorBlockReason,
  GCPServiceAccountKeySchema,
  InvalidRequestError,
  InternalServerError,
  isDecisionModelAdapter,
  LangfuseConflictError,
  LangfuseNotFoundError,
  type LLMConnectionConfig,
  LLMConnectionConfigSchema,
  LLMAdapter,
  OpenAIConfigSchema,
  supportedModels,
  VERTEXAI_USE_DEFAULT_CREDENTIALS,
  VertexAIConfigSchema,
  type ChatMessage,
  type JSONValue,
} from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import {
  blockEvaluatorsUsingProvider,
  ChatMessageType,
  createTypeSafeDecisionModelClient,
  decryptAndParseExtraHeaders,
  DefaultEvalModelService,
  EMPTY_EVALUATOR_BLOCK,
  EvaluatorBlockSource,
  finalizeEvaluatorBlocks,
  generateLLMText,
  getClientInitiatedNonStreamingLlmTimeoutMs,
  isPrismaRecordNotFoundError,
  logger,
  mapLegacyLLMCompletionParams,
  validateLlmConnectionBaseURL,
} from "@langfuse/shared/src/server";
import { prisma, Prisma, type LlmApiKeys } from "@langfuse/shared/src/db";
import {
  handleTopicsLlmApiKeyDeletion,
  invalidateTopicsProcessingActive,
} from "@langfuse/shared/topics/server";

import {
  LlmConnectionRepository,
  type LlmConnectionOwner,
} from "./llmConnectionRepository";

export type LlmConnectionWriteInput = {
  provider: string;
  adapter: LLMAdapter;
  secretKey: string;
  baseURL?: string | null;
  withDefaultModels?: boolean;
  customModels?: string[];
  config?: LLMConnectionConfig;
  extraHeaders?: Record<string, string>;
};

export type LlmConnectionUpdateInput = Omit<
  LlmConnectionWriteInput,
  "secretKey"
> & {
  id: string;
  secretKey?: string;
  extraHeaders?: Record<string, string | null | undefined>;
};

export type SafeLlmConnection = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  provider: string;
  displaySecretKey: string;
  adapter: LLMAdapter;
  baseURL: string | null;
  customModels: string[];
  withDefaultModels: boolean;
  extraHeaderKeys: string[];
  config: JSONValue | null;
  authMethod?: BedrockAuthMethod;
  secretKey?: undefined;
  extraHeaders?: undefined;
  scope?: "project" | "organization";
  projectId?: string;
  organizationId?: string;
};

type LlmConnectionWithAvailableModels = SafeLlmConnection & {
  availableModels: string[];
};

type TestLlmConnectionParams = Omit<
  LlmConnectionWriteInput,
  "withDefaultModels"
> & {
  /** Set only when reusing a credential from a project-owned database row. */
  projectId?: string;
  validateBaseUrlBeforeTest?: boolean;
  validateSecretBeforeTest?: boolean;
};

const toSafeConnection = (connection: LlmApiKeys): SafeLlmConnection => {
  const common = {
    id: connection.id,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    provider: connection.provider,
    displaySecretKey: connection.displaySecretKey,
    adapter: connection.adapter as LLMAdapter,
    baseURL: connection.baseURL,
    customModels: connection.customModels,
    withDefaultModels: connection.withDefaultModels,
    extraHeaderKeys: connection.extraHeaderKeys,
    config: LLMConnectionConfigSchema.nullable().parse(connection.config),
    ...(connection.adapter === LLMAdapter.Bedrock
      ? { authMethod: getBedrockAuthMethod(decrypt(connection.secretKey)) }
      : {}),
  };

  if (connection.projectId) {
    return {
      ...common,
      scope: "project",
      projectId: connection.projectId,
    };
  }

  if (connection.organizationId) {
    return {
      ...common,
      scope: "organization",
      organizationId: connection.organizationId,
    };
  }

  throw new Error(`LLM connection "${connection.id}" has no owner`);
};

function getDisplaySecretKey(secretKey: string): string {
  if (secretKey === BEDROCK_USE_DEFAULT_CREDENTIALS) {
    return "Default AWS credentials";
  }
  if (secretKey === VERTEXAI_USE_DEFAULT_CREDENTIALS) {
    return "Default GCP credentials (ADC)";
  }
  return secretKey.endsWith('"}')
    ? `...${secretKey.slice(-6, -2)}`
    : `...${secretKey.slice(-4)}`;
}

function validateBedrockSecretKey(secretKey: string): void {
  if (secretKey === BEDROCK_USE_DEFAULT_CREDENTIALS) {
    return;
  }

  try {
    BedrockCredentialSchema.parse(JSON.parse(secretKey));
  } catch {
    throw new InvalidRequestError(
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
    return "apiKey" in parsed ? AuthMethod.ApiKey : AuthMethod.AccessKeys;
  } catch (error) {
    logger.warn("Failed to derive Bedrock auth method from stored secret", {
      error,
    });
    return undefined;
  }
}

async function testDecisionModelConnection(params: {
  secretKey: string;
  model: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const client = createTypeSafeDecisionModelClient({
      apiKey: params.secretKey,
      model: params.model,
      baseURL: params.baseURL,
      extraHeaders: params.extraHeaders,
    });
    await client.evaluate({
      state: { message: "Hello, is anyone there?" },
      questions: {
        kind: {
          type: "choice",
          instructions: "What kind of message is `message`?",
          choices: [{ value: "greeting" }, { value: "other" }],
        },
      },
    });
    return { success: true };
  } catch (error) {
    logger.error(error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function validateBaseUrl(params: {
  adapter: LLMAdapter;
  baseURL?: string | null;
}): Promise<void> {
  if (!params.baseURL) {
    return;
  }

  if (params.adapter === LLMAdapter.TypeSafe) {
    const url = new URL(params.baseURL);
    if (/\/systemone\/?$/.test(url.pathname)) {
      throw new Error(
        "Remove /systemone from the end of the base URL. Langfuse appends it.",
      );
    }
    if (url.search || url.hash) {
      throw new Error(
        "Remove the query string from the base URL. Langfuse appends /systemone to it.",
      );
    }
  }

  await validateLlmConnectionBaseURL(params.baseURL);
}

async function validateBaseUrlForWrite(params: {
  adapter: LLMAdapter;
  baseURL?: string | null;
}): Promise<void> {
  try {
    await validateBaseUrl(params);
  } catch (error) {
    throw new InvalidRequestError(
      `Invalid base URL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function validateSecret(params: {
  adapter: LLMAdapter;
  secretKey: string;
}): void {
  const isLangfuseCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

  if (params.secretKey === BEDROCK_USE_DEFAULT_CREDENTIALS) {
    if (isLangfuseCloud || params.adapter !== LLMAdapter.Bedrock) {
      throw new InvalidRequestError(
        "Default AWS credentials are only allowed for Bedrock in self-hosted deployments.",
      );
    }
  }

  if (params.adapter === LLMAdapter.Bedrock) {
    validateBedrockSecretKey(params.secretKey);
  }

  if (params.secretKey === VERTEXAI_USE_DEFAULT_CREDENTIALS) {
    if (isLangfuseCloud || params.adapter !== LLMAdapter.VertexAI) {
      throw new InvalidRequestError(
        "Default GCP credentials (ADC) are only allowed for Vertex AI in self-hosted deployments.",
      );
    }
  }

  if (!env.ENCRYPTION_KEY) {
    if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      throw new InternalServerError("Internal server error");
    }
    throw new InvalidRequestError(
      "Missing environment variable: `ENCRYPTION_KEY`. Please consult our docs: https://langfuse.com/self-hosting",
    );
  }
}

function resolveUpdatedExtraHeaders(params: {
  inputHeaders: Record<string, string | null | undefined> | undefined;
  storedHeaders: string | null;
  isBaseURLChanged: boolean;
}): Record<string, string> | undefined {
  const existingHeaders: Record<string, string> = params.isBaseURLChanged
    ? {}
    : (decryptAndParseExtraHeaders(params.storedHeaders) ?? {});

  if (params.inputHeaders === undefined) {
    return Object.keys(existingHeaders).length > 0
      ? existingHeaders
      : undefined;
  }

  const extraHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(params.inputHeaders)) {
    if (value === null || value === undefined || value === "") {
      if (existingHeaders[key] !== undefined) {
        extraHeaders[key] = existingHeaders[key];
      }
    } else {
      extraHeaders[key] = value;
    }
  }

  return Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined;
}

async function testLlmConnection(
  params: TestLlmConnectionParams,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (params.validateBaseUrlBeforeTest !== false) {
      await validateBaseUrl(params);
    }
    if (params.validateSecretBeforeTest !== false) {
      validateSecret({ adapter: params.adapter, secretKey: params.secretKey });
    }

    const model = params.customModels?.length
      ? params.customModels[0]
      : supportedModels[params.adapter][0];
    if (!model) {
      throw new Error("No model found");
    }

    if (isDecisionModelAdapter(params.adapter)) {
      return testDecisionModelConnection({
        secretKey: params.secretKey,
        model,
        baseURL: params.baseURL,
        extraHeaders: params.extraHeaders,
      });
    }

    if (
      params.adapter === LLMAdapter.VertexAI &&
      params.secretKey !== VERTEXAI_USE_DEFAULT_CREDENTIALS
    ) {
      const parsed = GCPServiceAccountKeySchema.safeParse(
        JSON.parse(params.secretKey),
      );
      if (!parsed.success) {
        throw new Error("Invalid GCP service account JSON key");
      }
    }

    const messages: ChatMessage[] = [
      {
        role: ChatMessageRole.User,
        content: "How are you?",
        type: ChatMessageType.User,
      },
    ];

    let parsedConfig: LLMConnectionConfig | null = null;
    if (params.config && params.adapter === LLMAdapter.Bedrock) {
      const config = BedrockConfigSchema.parse(params.config);
      parsedConfig = { region: config.region };
    } else if (params.config && params.adapter === LLMAdapter.OpenAI) {
      parsedConfig = OpenAIConfigSchema.parse(params.config);
    } else if (params.config && params.adapter === LLMAdapter.VertexAI) {
      const config = VertexAIConfigSchema.parse(params.config);
      parsedConfig = config.location ? { location: config.location } : null;
    }

    await generateLLMText({
      ...mapLegacyLLMCompletionParams({
        modelParams: {
          adapter: params.adapter,
          provider: params.provider,
          model,
        },
        connection: {
          secretKey: encrypt(params.secretKey),
          projectId: params.projectId,
          extraHeaders: params.extraHeaders
            ? encrypt(JSON.stringify(params.extraHeaders))
            : undefined,
          baseURL: params.baseURL || undefined,
          config: parsedConfig,
        },
        messages,
      }),
      maxRetries: 1,
      timeout: getClientInitiatedNonStreamingLlmTimeoutMs(),
    });

    return { success: true };
  } catch (error) {
    logger.error(error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export class LlmConnectionService {
  constructor(
    private readonly repository = new LlmConnectionRepository(),
    private readonly db: typeof prisma = prisma,
  ) {}

  private async validateHierarchyAdapter(params: {
    repository: LlmConnectionRepository;
    owner: LlmConnectionOwner;
    provider: string;
    adapter: string;
  }): Promise<void> {
    const incompatibleConnection =
      await params.repository.findIncompatibleConnection({
        owner: params.owner,
        provider: params.provider,
        adapter: params.adapter,
      });
    if (incompatibleConnection) {
      throw new InvalidRequestError(
        "Project and organization connections with the same provider name must use the same adapter.",
      );
    }
  }

  async list(params: {
    owner: LlmConnectionOwner;
    includeDecisionModels?: boolean;
    limit?: number;
    page?: number;
  }): Promise<{ data: SafeLlmConnection[]; totalCount: number }> {
    const includeDecisionModels = params.includeDecisionModels ?? false;
    const [connections, totalCount] = await Promise.all([
      this.repository.list({
        owner: params.owner,
        includeDecisionModels,
        limit: params.limit,
        offset:
          params.limit && params.page
            ? (params.page - 1) * params.limit
            : undefined,
      }),
      this.repository.count({
        owner: params.owner,
        includeDecisionModels,
      }),
    ]);

    return {
      data: connections.map(toSafeConnection),
      totalCount,
    };
  }

  async listInherited(params: {
    owner: Extract<LlmConnectionOwner, { type: "project" }>;
    includeDecisionModels?: boolean;
  }): Promise<Array<SafeLlmConnection & { overriddenByProject: boolean }>> {
    const result = await this.repository.listOrganizationConnectionsForProject({
      projectId: params.owner.projectId,
      organizationId: params.owner.organizationId,
      includeDecisionModels: params.includeDecisionModels ?? false,
    });

    return result.connections.map((connection) => ({
      ...toSafeConnection(connection),
      overriddenByProject: result.overriddenProviders.has(connection.provider),
    }));
  }

  async listEffective(params: {
    owner: Extract<LlmConnectionOwner, { type: "project" }>;
    includeDecisionModels?: boolean;
  }): Promise<{ data: SafeLlmConnection[] }> {
    const connections = await this.repository.listEffectiveForProject({
      projectId: params.owner.projectId,
      organizationId: params.owner.organizationId,
      includeDecisionModels: params.includeDecisionModels ?? false,
    });

    return { data: connections.map(toSafeConnection) };
  }

  async listEffectiveWithAvailableModels(params: {
    owner: Extract<LlmConnectionOwner, { type: "project" }>;
    includeDecisionModels?: boolean;
  }): Promise<{ data: LlmConnectionWithAvailableModels[] }> {
    const { data } = await this.listEffective(params);

    return {
      data: data.map((connection) => ({
        ...connection,
        availableModels: getConnectionAvailableModels(connection),
      })),
    };
  }

  async exists(params: {
    owner: LlmConnectionOwner;
    provider: string;
  }): Promise<boolean> {
    return Boolean(await this.repository.findByProvider(params));
  }

  async create(params: {
    owner: LlmConnectionOwner;
    input: LlmConnectionWriteInput;
    actor: AuditLogActor;
  }): Promise<SafeLlmConnection> {
    await validateBaseUrlForWrite(params.input);
    validateSecret(params.input);

    let key: LlmApiKeys;
    try {
      key = await this.db.$transaction(async (tx) => {
        const repository = this.repository.withDb(tx);
        await this.validateHierarchyAdapter({
          repository,
          owner: params.owner,
          provider: params.input.provider,
          adapter: params.input.adapter,
        });
        return repository.create({
          owner: params.owner,
          data: {
            provider: params.input.provider,
            adapter: params.input.adapter,
            secretKey: encrypt(params.input.secretKey),
            displaySecretKey: getDisplaySecretKey(params.input.secretKey),
            baseURL: params.input.baseURL,
            withDefaultModels: params.input.withDefaultModels,
            customModels: params.input.customModels,
            config: params.input.config,
            extraHeaders: params.input.extraHeaders
              ? encrypt(JSON.stringify(params.input.extraHeaders))
              : undefined,
            extraHeaderKeys: params.input.extraHeaders
              ? Object.keys(params.input.extraHeaders)
              : undefined,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new LangfuseConflictError(
          "There already exists an API key for this provider.",
        );
      }
      throw error;
    }

    await auditLog({
      ...params.actor,
      resourceType: "llmApiKey",
      resourceId: key.id,
      action: "create",
    });

    return toSafeConnection(key);
  }

  async upsert(params: {
    owner: LlmConnectionOwner;
    input: LlmConnectionWriteInput;
    actor: AuditLogActor;
  }): Promise<{ connection: SafeLlmConnection; created: boolean }> {
    const storedConnection = await this.repository.findByProvider({
      owner: params.owner,
      provider: params.input.provider,
    });
    if (
      !storedConnection ||
      params.input.baseURL !== storedConnection.baseURL
    ) {
      await validateBaseUrlForWrite(params.input);
    }
    validateSecret(params.input);

    const encryptedSecretKey = encrypt(params.input.secretKey);
    const displaySecretKey = getDisplaySecretKey(params.input.secretKey);
    const encryptedExtraHeaders = params.input.extraHeaders
      ? encrypt(JSON.stringify(params.input.extraHeaders))
      : undefined;
    const extraHeaderKeys = params.input.extraHeaders
      ? Object.keys(params.input.extraHeaders)
      : undefined;
    const { connection, existing } = await this.db.$transaction(async (tx) => {
      const repository = this.repository.withDb(tx);
      const existing = await repository.findByProvider({
        owner: params.owner,
        provider: params.input.provider,
      });
      if (!existing || existing.adapter !== params.input.adapter) {
        await this.validateHierarchyAdapter({
          repository,
          owner: params.owner,
          provider: params.input.provider,
          adapter: params.input.adapter,
        });
      }
      const connection = await repository.upsert({
        owner: params.owner,
        provider: params.input.provider,
        create: {
          provider: params.input.provider,
          adapter: params.input.adapter,
          secretKey: encryptedSecretKey,
          displaySecretKey,
          baseURL: params.input.baseURL,
          withDefaultModels: params.input.withDefaultModels,
          customModels: params.input.customModels,
          config: params.input.config,
          extraHeaders: encryptedExtraHeaders,
          extraHeaderKeys,
        },
        update: {
          adapter: params.input.adapter,
          secretKey: encryptedSecretKey,
          displaySecretKey,
          baseURL: params.input.baseURL ?? null,
          withDefaultModels: params.input.withDefaultModels,
          customModels: params.input.customModels ?? [],
          ...(params.input.config !== undefined
            ? { config: params.input.config ?? Prisma.DbNull }
            : {}),
          extraHeaders: encryptedExtraHeaders ?? null,
          extraHeaderKeys: extraHeaderKeys ?? [],
        },
      });
      return { connection, existing };
    });

    await auditLog({
      ...params.actor,
      resourceType: "llmApiKey",
      resourceId: connection.id,
      action: existing ? "update" : "create",
      ...(existing
        ? {
            before: toSafeConnection(existing),
            after: toSafeConnection(connection),
          }
        : {}),
    });

    return {
      connection: toSafeConnection(connection),
      created: existing === null,
    };
  }

  async update(params: {
    owner: LlmConnectionOwner;
    input: LlmConnectionUpdateInput;
    actor: AuditLogActor;
  }): Promise<SafeLlmConnection> {
    const existingKey = await this.repository.findById({
      owner: params.owner,
      id: params.input.id,
    });
    if (!existingKey) {
      throw new LangfuseNotFoundError("LLM connection not found");
    }
    if (
      params.input.provider !== existingKey.provider ||
      params.input.adapter !== existingKey.adapter
    ) {
      throw new InvalidRequestError("Provider and adapter cannot be changed");
    }

    const isBaseURLChanged =
      params.input.baseURL !== undefined &&
      params.input.baseURL !== existingKey.baseURL;
    if (isBaseURLChanged && !params.input.secretKey) {
      throw new InvalidRequestError(
        "Secret key is required when changing the base URL",
      );
    }
    if (isBaseURLChanged) {
      await validateBaseUrlForWrite(params.input);
    }
    if (params.input.secretKey) {
      validateSecret({
        adapter: params.input.adapter,
        secretKey: params.input.secretKey,
      });
    }

    const extraHeaders = resolveUpdatedExtraHeaders({
      inputHeaders: params.input.extraHeaders,
      storedHeaders: existingKey.extraHeaders,
      isBaseURLChanged,
    });
    let encryptedExtraHeaders: string | null | undefined;
    let extraHeaderKeys: string[] | undefined;
    if (extraHeaders) {
      encryptedExtraHeaders = encrypt(JSON.stringify(extraHeaders));
      extraHeaderKeys = Object.keys(extraHeaders);
    } else if (isBaseURLChanged || params.input.extraHeaders !== undefined) {
      encryptedExtraHeaders = null;
      extraHeaderKeys = [];
    }

    const key = await this.repository.update({
      owner: params.owner,
      id: params.input.id,
      data: {
        ...(params.input.secretKey
          ? {
              secretKey: encrypt(params.input.secretKey),
              displaySecretKey: getDisplaySecretKey(params.input.secretKey),
            }
          : {}),
        extraHeaders: encryptedExtraHeaders,
        extraHeaderKeys,
        baseURL: params.input.baseURL,
        withDefaultModels: params.input.withDefaultModels,
        customModels: params.input.customModels,
        config: params.input.config,
      },
    });

    await auditLog({
      ...params.actor,
      resourceType: "llmApiKey",
      resourceId: key.id,
      action: "update",
      before: toSafeConnection(existingKey),
      after: toSafeConnection(key),
    });

    return toSafeConnection(key);
  }

  test(input: LlmConnectionWriteInput): Promise<{
    success: boolean;
    error?: string;
  }> {
    return testLlmConnection(input);
  }

  async testUpdate(params: {
    owner: LlmConnectionOwner;
    input: LlmConnectionUpdateInput;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const existingKey = await this.repository.findById({
        owner: params.owner,
        id: params.input.id,
      });
      if (!existingKey) {
        throw new LangfuseNotFoundError("LLM connection not found");
      }

      const hasNewSecretKey = Boolean(params.input.secretKey);
      const baseURL =
        params.input.baseURL !== undefined
          ? params.input.baseURL
          : existingKey.baseURL;
      const isBaseURLChanged = baseURL !== existingKey.baseURL;
      if (isBaseURLChanged && !hasNewSecretKey) {
        throw new InvalidRequestError(
          "Secret key is required when changing the base URL",
        );
      }

      const extraHeaders = resolveUpdatedExtraHeaders({
        inputHeaders: params.input.extraHeaders,
        storedHeaders: existingKey.extraHeaders,
        isBaseURLChanged,
      });

      return testLlmConnection({
        adapter: params.input.adapter,
        provider: params.input.provider,
        secretKey: params.input.secretKey || decrypt(existingKey.secretKey),
        projectId: hasNewSecretKey
          ? undefined
          : (existingKey.projectId ?? undefined),
        baseURL,
        customModels: params.input.customModels ?? existingKey.customModels,
        extraHeaders,
        config:
          params.input.config ??
          LLMConnectionConfigSchema.nullable().parse(existingKey.config) ??
          undefined,
        validateBaseUrlBeforeTest: isBaseURLChanged,
        validateSecretBeforeTest: hasNewSecretKey,
      });
    } catch (error) {
      logger.error(error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async delete(params: {
    owner: LlmConnectionOwner;
    id: string;
    actor: AuditLogActor;
  }): Promise<void> {
    const connection = await this.repository.findById({
      owner: params.owner,
      id: params.id,
    });
    if (!connection) {
      throw new LangfuseNotFoundError("LLM connection not found");
    }

    const organizationFallback =
      params.owner.type === "project"
        ? await this.repository.findByProvider({
            owner: {
              type: "organization",
              organizationId: params.owner.organizationId,
            },
            provider: connection.provider,
          })
        : null;
    const hasCompatibleOrganizationFallback =
      organizationFallback?.adapter === connection.adapter;
    let providerProjectIds: string[];
    if (params.owner.type === "project") {
      providerProjectIds = hasCompatibleOrganizationFallback
        ? []
        : [params.owner.projectId];
    } else {
      providerProjectIds =
        await this.repository.listProjectsUsingOrganizationConnection({
          organizationId: params.owner.organizationId,
          provider: connection.provider,
        });
    }
    const { blockResults, topicProjectIds } = await this.db.$transaction(
      async (tx) => {
        const txRepository = this.repository.withDb(tx);
        const defaultModelResults =
          await DefaultEvalModelService.handleLlmApiKeyDeletion({
            tx,
            llmApiKeyId: connection.id,
            llmApiKeyOwner: {
              projectId: connection.projectId,
              organizationId: connection.organizationId,
            },
            provider: connection.provider,
            adapter: connection.adapter,
          });
        const defaultModelBlocksByProjectId = new Map(
          defaultModelResults.map(({ projectId, defaultModelBlock }) => [
            projectId,
            defaultModelBlock,
          ]),
        );
        const affectedProjectIds = new Set([
          ...providerProjectIds,
          ...defaultModelBlocksByProjectId.keys(),
        ]);
        const providerProjectIdSet = new Set(providerProjectIds);
        const results: Array<{
          projectId: string;
          providerBlock: typeof EMPTY_EVALUATOR_BLOCK;
          defaultModelBlock: typeof EMPTY_EVALUATOR_BLOCK;
        }> = [];

        for (const projectId of affectedProjectIds) {
          const providerBlock = providerProjectIdSet.has(projectId)
            ? await blockEvaluatorsUsingProvider({
                tx,
                projectId,
                provider: connection.provider,
              })
            : EMPTY_EVALUATOR_BLOCK;
          const defaultModelBlock =
            defaultModelBlocksByProjectId.get(projectId) ??
            EMPTY_EVALUATOR_BLOCK;
          results.push({ projectId, providerBlock, defaultModelBlock });
        }

        const topicProjectIds = await handleTopicsLlmApiKeyDeletion({
          tx,
          llmApiKeyId: connection.id,
          llmApiKeyOwner: {
            projectId: connection.projectId,
            organizationId: connection.organizationId,
          },
          provider: connection.provider,
          adapter: connection.adapter,
        });

        try {
          await txRepository.delete({
            owner: params.owner,
            id: params.id,
          });
        } catch (error) {
          if (isPrismaRecordNotFoundError(error)) {
            throw new LangfuseNotFoundError("LLM connection not found");
          }
          throw error;
        }

        await auditLog(
          {
            ...params.actor,
            resourceType: "llmApiKey",
            resourceId: connection.id,
            action: "delete",
            before: toSafeConnection(connection),
          },
          tx,
        );

        return {
          blockResults: results,
          topicProjectIds,
        };
      },
    );

    await Promise.all([
      ...topicProjectIds.map((projectId) =>
        invalidateTopicsProcessingActive(projectId),
      ),
      ...blockResults.map((result) =>
        finalizeEvaluatorBlocks({
          projectId: result.projectId,
          source: EvaluatorBlockSource.LLM_API_KEY_DELETION,
          evaluatorIdsByReason: {
            [EvaluatorBlockReason.LLM_CONNECTION_MISSING]:
              result.providerBlock.blockedEvaluatorIds,
            [EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING]:
              result.defaultModelBlock.blockedEvaluatorIds,
          },
        }),
      ),
    ]);
  }
}
