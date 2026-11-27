import {
  auditLog,
  type AuditLogActor,
} from "@/src/features/audit-logs/auditLog";
import { env } from "@/src/env.mjs";
import {
  AuthMethod,
  type BedrockAuthMethod,
} from "@/src/features/llm-api-key/types";
import { getConnectionAvailableModels } from "@/src/features/llm-api-key/availableModels";
import { decisionModelsByProvider } from "@/src/features/evals/v2/fns/evaluators/preferredDecisionModel";
import {
  BEDROCK_USE_DEFAULT_CREDENTIALS,
  BedrockConfigSchema,
  BedrockCredentialSchema,
  ChatMessageRole,
  EvaluatorBlockReason,
  GCPServiceAccountKeySchema,
  InvalidRequestError,
  INVALID_LLM_BASE_URL_PREFIX,
  InternalServerError,
  isDecisionModelAdapter,
  LangfuseConflictError,
  LangfuseNotFoundError,
  type LLMConnectionConfig,
  LLMConnectionConfigSchema,
  LLMAdapter,
  OpenAIConfigSchema,
  parseBedrockIamRole,
  supportedModels,
  VERTEXAI_USE_DEFAULT_CREDENTIALS,
  VertexAIConfigSchema,
  type ChatMessage,
  type JSONValue,
} from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import {
  type BedrockConnectionOwner,
  deriveBedrockExternalId,
} from "@langfuse/shared/src/server/ee/bedrockRoleAuth/bedrockRoleCredentials";
import {
  assertStorageRolePartition,
  getCrossAccountRoleArn,
} from "@langfuse/shared/src/server/ee/storageRoleAuth/storageRoleCredentials";
import {
  blockEvaluatorsUsingProvider,
  ChatMessageType,
  createTypeSafeDecisionModelClient,
  DefaultEvalModelService,
  EMPTY_EVALUATOR_BLOCK,
  embedLLMText,
  EvaluatorBlockSource,
  finalizeEvaluatorBlocks,
  generateLLMText,
  getClientInitiatedNonStreamingLlmTimeoutMs,
  getLLMErrorInfo,
  isPrismaRecordNotFoundError,
  logger,
  mapLegacyLLMCompletionParams,
  resolveUpdatedExtraHeaders,
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

/**
 * Set only when the organization's plan includes Bedrock IAM role auth.
 * Without it, IAM role credentials are rejected.
 */
export type BedrockIamRoleAccess = {
  owner: BedrockConnectionOwner;
  /** From the form, which shows the derived external ID before saving. */
  externalIdNonce?: string;
};

type LlmConnectionWithAvailableModels = SafeLlmConnection & {
  availableModels: string[];
  decisionModels?: string[];
};

type TestLlmConnectionParams = Omit<
  LlmConnectionWriteInput,
  "withDefaultModels"
> & {
  /** Set only when reusing a credential from a project-owned database row. */
  projectId?: string;
  /** Set only when reusing a credential from an organization-owned database row. */
  organizationId?: string;
  validateBaseUrlBeforeTest?: boolean;
  validateSecretBeforeTest?: boolean;
  bedrockIamRole?: BedrockIamRoleAccess;
  /** Encrypted external ID stored on the connection being tested. */
  externalId?: string | null;
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

function isBedrockIamRole(adapter: LLMAdapter, secretKey: string) {
  return adapter === LLMAdapter.Bedrock && parseBedrockIamRole(secretKey);
}

/** The connection's stored external ID, else one derived from the form's nonce. Encrypted. */
function resolveBedrockExternalId(params: {
  bedrockIamRole: BedrockIamRoleAccess | undefined;
  storedExternalId?: string | null;
}): string {
  if (params.storedExternalId) {
    return params.storedExternalId;
  }
  const nonce = params.bedrockIamRole?.externalIdNonce;
  if (!params.bedrockIamRole || !nonce) {
    throw new InvalidRequestError(
      "The external ID for IAM role auth is missing. Reopen the form and try again.",
    );
  }
  return encrypt(
    deriveBedrockExternalId({
      owner: params.bedrockIamRole.owner,
      nonce,
    }),
  );
}

/**
 * Drops Bedrock `customModelConfig` entries whose model is no longer a custom
 * model. Returns `config` itself when nothing is dropped.
 */
function pruneBedrockCustomModelConfig(
  config: LLMConnectionConfig | undefined,
  customModels: string[],
): LLMConnectionConfig | undefined {
  const customModelConfig = config?.customModelConfig;
  if (!config || typeof customModelConfig !== "object") {
    return config;
  }
  const entries = Object.entries(customModelConfig);
  const keptEntries = entries.filter(([model]) => customModels.includes(model));
  if (keptEntries.length === entries.length) {
    return config;
  }
  const { customModelConfig: _removed, ...rest } = config;
  return keptEntries.length > 0
    ? { ...rest, customModelConfig: Object.fromEntries(keptEntries) }
    : rest;
}

function getDisplaySecretKey(secretKey: string): string {
  if (secretKey === BEDROCK_USE_DEFAULT_CREDENTIALS) {
    return "Default AWS credentials";
  }
  const iamRole = parseBedrockIamRole(secretKey);
  if (iamRole) {
    return iamRole.roleArn;
  }
  if (secretKey === VERTEXAI_USE_DEFAULT_CREDENTIALS) {
    return "Default GCP credentials (ADC)";
  }
  return secretKey.endsWith('"}')
    ? `...${secretKey.slice(-6, -2)}`
    : `...${secretKey.slice(-4)}`;
}

function validateBedrockSecretKey(
  secretKey: string,
  bedrockIamRole: BedrockIamRoleAccess | undefined,
): void {
  if (secretKey === BEDROCK_USE_DEFAULT_CREDENTIALS) {
    return;
  }

  const iamRole = parseBedrockIamRole(secretKey);
  if (iamRole) {
    if (!bedrockIamRole) {
      throw new InvalidRequestError(
        "IAM role auth for Bedrock is only available on the Enterprise plan.",
      );
    }
    if (!getCrossAccountRoleArn()) {
      throw new InvalidRequestError(
        "IAM role auth for Bedrock is not available on this deployment.",
      );
    }
    assertStorageRolePartition(iamRole.roleArn);
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
  if (parseBedrockIamRole(secretKey)) {
    return AuthMethod.IamRole;
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
      `${INVALID_LLM_BASE_URL_PREFIX}${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function validateSecret(params: {
  adapter: LLMAdapter;
  secretKey: string;
  bedrockIamRole?: BedrockIamRoleAccess;
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
    validateBedrockSecretKey(params.secretKey, params.bedrockIamRole);
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

async function testLlmConnection(
  params: TestLlmConnectionParams,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (params.validateBaseUrlBeforeTest !== false) {
      await validateBaseUrl(params);
    }
    if (params.validateSecretBeforeTest !== false) {
      validateSecret({
        adapter: params.adapter,
        secretKey: params.secretKey,
        bedrockIamRole: params.bedrockIamRole,
      });
    }
    const iamRole = isBedrockIamRole(params.adapter, params.secretKey);
    const roleOwner = iamRole ? params.bedrockIamRole?.owner : undefined;

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
      parsedConfig = BedrockConfigSchema.parse(params.config);
    } else if (params.config && params.adapter === LLMAdapter.OpenAI) {
      parsedConfig = OpenAIConfigSchema.parse(params.config);
    } else if (params.config && params.adapter === LLMAdapter.VertexAI) {
      const config = VertexAIConfigSchema.parse(params.config);
      parsedConfig = config.location ? { location: config.location } : null;
    }

    const request = mapLegacyLLMCompletionParams({
      modelParams: {
        adapter: params.adapter,
        provider: params.provider,
        model,
      },
      connection: {
        secretKey: encrypt(params.secretKey),
        projectId:
          params.projectId ??
          (roleOwner?.type === "project" ? roleOwner.projectId : undefined),
        organizationId:
          params.organizationId ??
          (roleOwner?.type === "organization"
            ? roleOwner.organizationId
            : undefined),
        externalId: iamRole
          ? resolveBedrockExternalId({
              bedrockIamRole: params.bedrockIamRole,
              storedExternalId: params.externalId,
            })
          : undefined,
        extraHeaders: params.extraHeaders
          ? encrypt(JSON.stringify(params.extraHeaders))
          : undefined,
        baseURL: params.baseURL || undefined,
        config: parsedConfig,
      },
      messages,
    });
    const timeout = getClientInitiatedNonStreamingLlmTimeoutMs();
    // One deadline for both calls keeps the request under the load balancer timeout.
    const deadline = Date.now() + timeout;

    try {
      await generateLLMText({ ...request, maxRetries: 1, timeout });
    } catch (chatError) {
      // Embedding-only deployments (e.g. Azure) reject chat requests; accept them if they embed.
      // A hang says nothing about embeddings, so it keeps the chat error.
      const kind = getLLMErrorInfo(chatError)?.kind;
      const remainingMs = deadline - Date.now();
      if (
        params.adapter === LLMAdapter.Anthropic ||
        kind === "timeout" ||
        kind === "abort" ||
        remainingMs <= 0
      )
        throw chatError;
      try {
        await embedLLMText({
          model: request.model,
          connection: request.connection,
          values: ["How are you?"],
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(remainingMs),
        });
      } catch (embeddingError) {
        logger.error(embeddingError);
        throw new Error(
          `"${model}" failed as both a chat and an embedding model. Chat error: ${
            chatError instanceof Error ? chatError.message : "Unknown error"
          }`,
        );
      }
    }

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
    const decisionModels = params.includeDecisionModels
      ? decisionModelsByProvider(data)
      : null;

    return {
      data: data.map((connection) => ({
        ...connection,
        availableModels: getConnectionAvailableModels(connection),
        ...(decisionModels && {
          decisionModels: decisionModels.get(connection.provider) ?? [],
        }),
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
    bedrockIamRole?: BedrockIamRoleAccess;
  }): Promise<SafeLlmConnection> {
    await validateBaseUrlForWrite(params.input);
    validateSecret({
      ...params.input,
      bedrockIamRole: params.bedrockIamRole,
    });
    const externalId = isBedrockIamRole(
      params.input.adapter,
      params.input.secretKey,
    )
      ? resolveBedrockExternalId({ bedrockIamRole: params.bedrockIamRole })
      : undefined;
    const config = pruneBedrockCustomModelConfig(
      params.input.config,
      params.input.customModels ?? [],
    );

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
            externalId,
            baseURL: params.input.baseURL,
            withDefaultModels: params.input.withDefaultModels,
            customModels: params.input.customModels,
            config,
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
    const config = pruneBedrockCustomModelConfig(
      params.input.config,
      params.input.customModels ?? [],
    );
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
          config,
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
          ...(config !== undefined ? { config } : {}),
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
    bedrockIamRole?: BedrockIamRoleAccess;
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
        bedrockIamRole: params.bedrockIamRole,
      });
    }
    // Kept once stored, so a changed role ARN keeps the trusted external ID.
    const externalId =
      params.input.secretKey &&
      isBedrockIamRole(params.input.adapter, params.input.secretKey)
        ? resolveBedrockExternalId({
            bedrockIamRole: params.bedrockIamRole,
            storedExternalId: existingKey.externalId,
          })
        : undefined;

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

    const customModels = params.input.customModels ?? existingKey.customModels;
    let config = pruneBedrockCustomModelConfig(
      params.input.config,
      customModels,
    );
    let writesBackStoredConfig = false;
    if (!params.input.config && params.input.customModels) {
      const storedConfig =
        LLMConnectionConfigSchema.nullable().parse(existingKey.config) ??
        undefined;
      const prunedConfig = pruneBedrockCustomModelConfig(
        storedConfig,
        customModels,
      );
      if (prunedConfig !== storedConfig) {
        config = prunedConfig;
        writesBackStoredConfig = true;
      }
    }

    // Writing back the stored config must not overwrite a concurrent change.
    const key = await this.repository
      .update({
        owner: params.owner,
        id: params.input.id,
        expectedUpdatedAt: writesBackStoredConfig
          ? existingKey.updatedAt
          : undefined,
        data: {
          ...(params.input.secretKey
            ? {
                secretKey: encrypt(params.input.secretKey),
                displaySecretKey: getDisplaySecretKey(params.input.secretKey),
              }
            : {}),
          externalId,
          extraHeaders: encryptedExtraHeaders,
          extraHeaderKeys,
          baseURL: params.input.baseURL,
          withDefaultModels: params.input.withDefaultModels,
          customModels: params.input.customModels,
          config,
        },
      })
      .catch((error: unknown) => {
        if (writesBackStoredConfig && isPrismaRecordNotFoundError(error)) {
          throw new LangfuseConflictError(
            "The LLM connection was changed by another request. Reload and try again.",
          );
        }
        throw error;
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

  test(
    input: LlmConnectionWriteInput,
    options?: { bedrockIamRole?: BedrockIamRoleAccess },
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    return testLlmConnection({
      ...input,
      bedrockIamRole: options?.bedrockIamRole,
    });
  }

  async testUpdate(params: {
    owner: LlmConnectionOwner;
    input: LlmConnectionUpdateInput;
    bedrockIamRole?: BedrockIamRoleAccess;
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
        organizationId: hasNewSecretKey
          ? undefined
          : (existingKey.organizationId ?? undefined),
        baseURL,
        customModels: params.input.customModels ?? existingKey.customModels,
        extraHeaders,
        config:
          params.input.config ??
          LLMConnectionConfigSchema.nullable().parse(existingKey.config) ??
          undefined,
        validateBaseUrlBeforeTest: isBaseURLChanged,
        validateSecretBeforeTest: hasNewSecretKey,
        bedrockIamRole: params.bedrockIamRole,
        externalId: existingKey.externalId,
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
