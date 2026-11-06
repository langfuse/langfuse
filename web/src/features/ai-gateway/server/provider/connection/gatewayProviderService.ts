import {
  Prisma,
  type GatewayConnectionStatus,
  type GatewayProvider,
  type PrismaClient,
} from "@langfuse/shared/src/db";
import {
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import {
  decryptAndParseExtraHeaders,
  LLMAdapter,
  resolveUpdatedExtraHeaders,
  testModelCall,
  validateLlmConnectionBaseURL,
} from "@langfuse/shared/src/server";
import { getDisplaySecretKey } from "@langfuse/shared/src/server/auth/apiKeys";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { GATEWAY_CONNECTION_NAME_ERRORS } from "@/src/features/ai-gateway/constants/gatewayConnection";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { getGatewayFetch } from "@/src/features/ai-gateway/server/provider/getGatewayFetch";
import {
  type GatewayProviderName,
  getGatewayProviderDefinition,
} from "@/src/features/ai-gateway/server/provider/registry";
import {
  encodeBedrockCredential,
  type GatewayBedrockConfig,
} from "@/src/features/ai-gateway/server/provider/bedrock";
import { invalidateGatewayResolveCacheForOrganization } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import type { GatewayCustomModel } from "@/src/features/ai-gateway/fns/parseGatewayCustomModels";
import { assertValidExtraHeaders } from "./assertValidExtraHeaders";
import { parseGatewayConnectionName } from "./parseGatewayConnectionName";
import { GatewayProviderRepository } from "./gatewayProviderRepository";
import { testGatewayModel } from "./testGatewayModel";
import { GatewayModelCatalogService } from "../models/gatewayModelCatalogService";
import { getModelDiscoveryAdapter } from "../models/modelDiscoveryRegistry";

export class GatewayProviderService {
  private readonly repository: GatewayProviderRepository;
  private readonly modelCatalogService: GatewayModelCatalogService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly validateCredential: CredentialValidator = validateGatewayCredential,
    modelCatalogService?: GatewayModelCatalogService,
  ) {
    this.repository = new GatewayProviderRepository(prisma);
    this.modelCatalogService =
      modelCatalogService ?? new GatewayModelCatalogService(prisma);
  }

  list(params: { organizationId: string; cursor?: string; limit: number }) {
    return this.repository.listConnections(params);
  }

  async get(params: { organizationId: string; id: string }) {
    const connection = await this.repository.getSafeConnection(params);
    if (!connection) throw new LangfuseNotFoundError("Provider credential");
    return connection;
  }

  async listAll(organizationId: string, status?: GatewayConnectionStatus) {
    const connections = [];
    let cursor: string | undefined;
    do {
      const page = await this.repository.listConnections({
        organizationId,
        cursor,
        limit: 100,
        status,
      });
      connections.push(...page.data);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return connections;
  }

  async testCredential(params: {
    organizationId: string;
    /** Set when editing, so the test merges stored header values as saving does. */
    connectionId?: string;
    provider: GatewayProvider;
    credential: string;
    config?: GatewayBedrockConfig;
    baseURL?: string | null;
    extraHeaders?: Record<string, string>;
  }) {
    if (params.connectionId) {
      const existing = await this.repository.getSafeConnection({
        organizationId: params.organizationId,
        id: params.connectionId,
      });
      if (!existing || existing.provider !== params.provider) {
        throw new LangfuseNotFoundError("Provider credential");
      }
      const { endpoint } = await this.resolveEditedEndpoint({
        organizationId: params.organizationId,
        existing,
        baseURL: params.baseURL,
        extraHeaders: params.extraHeaders,
        hasCredential: true,
      });
      return this.validateCredential({
        provider: existing.provider,
        credential: params.credential,
        config: existing.config,
        ...endpoint,
      });
    }
    const endpoint = await parseConnectionEndpoint({
      provider: params.provider,
      baseURL: params.baseURL ?? null,
      extraHeaders: params.extraHeaders ?? null,
    });
    return this.validateCredential({
      provider: params.provider,
      credential: params.credential,
      config: parseConnectionConfig(params.provider, params.config),
      ...endpoint,
    });
  }

  async create(params: {
    organizationId: string;
    name: string;
    provider: GatewayProvider;
    credential: string;
    config?: GatewayBedrockConfig;
    baseURL?: string | null;
    extraHeaders?: Record<string, string>;
    session: OrgAuthedContext["session"];
  }) {
    const name = parseGatewayConnectionName(params.name);
    const config = parseConnectionConfig(params.provider, params.config);
    const endpoint = await parseConnectionEndpoint({
      provider: params.provider,
      baseURL: params.baseURL ?? null,
      extraHeaders: params.extraHeaders ?? null,
    });
    await this.assertNameAvailable({
      organizationId: params.organizationId,
      name,
    });
    const { modelListingDenied } = await this.validateCredential({
      provider: params.provider,
      credential: params.credential,
      config,
      ...endpoint,
    });
    let connection;
    try {
      connection = await this.repository.createConnection({
        organizationId: params.organizationId,
        name,
        provider: params.provider,
        encryptedCredential: encrypt(
          toStoredCredential(params.provider, params.credential),
        ),
        displaySecret: getDisplaySecretKey(params.credential),
        config,
        ...toStoredEndpoint(endpoint),
        createdById: params.session.user.id,
        status: "ENABLED",
      });
    } catch (error) {
      rethrowConnectionMutationError(error);
    }
    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayAiConnection",
        resourceId: connection.id,
        action: "create",
        after: connection,
      },
      this.prisma,
    );
    return { ...connection, modelListingDenied };
  }

  async update(params: {
    organizationId: string;
    id: string;
    name?: string;
    credential?: string;
    baseURL?: string | null;
    extraHeaders?: Record<string, string>;
    status?: GatewayConnectionStatus;
    session: OrgAuthedContext["session"];
  }) {
    const existing = await this.repository.getSafeConnection({
      organizationId: params.organizationId,
      id: params.id,
    });
    if (!existing) throw new LangfuseNotFoundError("Provider credential");
    /** Unchanged names skip validation so pre-existing names stay editable. */
    const name =
      params.name === undefined || params.name.trim() === existing.name
        ? undefined
        : parseGatewayConnectionName(params.name);
    if (name !== undefined) {
      await this.assertNameAvailable({
        organizationId: params.organizationId,
        name,
        excludeId: existing.id,
      });
    }
    if (
      existing.status === "ERROR" &&
      params.status === "ENABLED" &&
      !params.credential
    ) {
      throw new InvalidRequestError(
        "Errored provider credentials need a credential update or a successful retry",
      );
    }
    const { endpoint, isEndpointChanged } = await this.resolveEditedEndpoint({
      organizationId: params.organizationId,
      existing,
      baseURL: params.baseURL,
      extraHeaders: params.extraHeaders,
      hasCredential: Boolean(params.credential),
    });
    const { modelListingDenied } = params.credential
      ? await this.validateCredential({
          provider: existing.provider,
          credential: params.credential,
          config: existing.config,
          ...endpoint,
        })
      : { modelListingDenied: false };

    let updated;
    try {
      updated = await this.repository.updateConnection({
        organizationId: params.organizationId,
        id: params.id,
        name,
        status: params.credential ? "ENABLED" : params.status,
        encryptedCredential: params.credential
          ? encrypt(toStoredCredential(existing.provider, params.credential))
          : undefined,
        displaySecret: params.credential
          ? getDisplaySecretKey(params.credential)
          : undefined,
        ...(isEndpointChanged ? toStoredEndpoint(endpoint) : {}),
      });
    } catch (error) {
      rethrowConnectionMutationError(error);
    }
    await this.modelCatalogService.clearModelCache(
      params.organizationId,
      params.id,
    );
    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayAiConnection",
        resourceId: params.id,
        action: "update",
        before: existing,
        after: updated,
      },
      this.prisma,
    );
    return { ...updated, modelListingDenied };
  }

  async delete(params: {
    organizationId: string;
    id: string;
    session: OrgAuthedContext["session"];
  }) {
    // Only the two identifiers, never the whole params object: the extra
    // `session` field would land in the Prisma `where` and fail validation.
    const deleted = await this.repository.deleteConnection({
      organizationId: params.organizationId,
      id: params.id,
    });
    await this.modelCatalogService.clearModelCache(
      params.organizationId,
      params.id,
    );
    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayAiConnection",
        resourceId: params.id,
        action: "delete",
        before: deleted,
      },
      this.prisma,
    );
    return deleted;
  }

  /** Names differing only by case read as the same slug prefix, so they count as taken. */
  /** Merges an edit's base URL and extra headers with the stored ones. */
  private async resolveEditedEndpoint(params: {
    organizationId: string;
    existing: { id: string; provider: GatewayProvider; baseURL: string | null };
    baseURL?: string | null;
    extraHeaders?: Record<string, string>;
    hasCredential: boolean;
  }) {
    // Stored header values may hold secrets meant for the old host, so a new
    // base URL needs a new credential and drops them, as for LLM connections.
    const baseURL =
      params.baseURL === undefined
        ? undefined
        : toCanonicalBaseURL(params.existing.provider, params.baseURL);
    const isBaseURLChanged =
      baseURL !== undefined && baseURL !== params.existing.baseURL;
    if (isBaseURLChanged && !params.hasCredential) {
      throw new InvalidRequestError(
        "A new credential is required when changing the base URL",
      );
    }
    const isEndpointChanged =
      isBaseURLChanged || params.extraHeaders !== undefined;
    const storedHeaders =
      isEndpointChanged || params.hasCredential
        ? await this.repository.getEncryptedExtraHeaders({
            organizationId: params.organizationId,
            id: params.existing.id,
          })
        : null;
    const endpoint = {
      baseURL: isBaseURLChanged ? (baseURL ?? null) : params.existing.baseURL,
      extraHeaders:
        resolveUpdatedExtraHeaders({
          inputHeaders: params.extraHeaders,
          storedHeaders,
          isBaseURLChanged,
        }) ?? null,
    };
    if (isEndpointChanged) {
      await parseConnectionEndpoint({
        provider: params.existing.provider,
        ...endpoint,
        // An unchanged base URL was validated when it was saved.
        baseURL: isBaseURLChanged ? endpoint.baseURL : null,
      });
    }
    return { endpoint, isEndpointChanged };
  }

  private async assertNameAvailable(params: {
    organizationId: string;
    name: string;
    excludeId?: string;
  }) {
    if (await this.repository.hasConnectionNamedIgnoringCase(params)) {
      throw new InvalidRequestError(GATEWAY_CONNECTION_NAME_ERRORS.duplicate);
    }
  }

  async updateAllowedModels(params: {
    organizationId: string;
    id: string;
    allowedModels: string[] | null;
    expectedUpdatedAt: Date;
    session: OrgAuthedContext["session"];
  }) {
    const existing = await this.get({
      organizationId: params.organizationId,
      id: params.id,
    });
    const updated = await this.repository.updateAllowedModels({
      organizationId: params.organizationId,
      id: params.id,
      expectedUpdatedAt: params.expectedUpdatedAt,
      allowedModels:
        params.allowedModels === null
          ? null
          : [...new Set(params.allowedModels)],
    });
    if (!updated) {
      throw new LangfuseConflictError(
        "Model access changed while this page was open. Reload and try again.",
      );
    }
    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayAiConnection",
        resourceId: params.id,
        action: "update",
        before: existing,
        after: updated,
      },
      this.prisma,
    );
    return updated;
  }

  async testModel(params: {
    organizationId: string;
    id: string;
    model: string;
  }) {
    const connection = await this.repository.getConnectionWithCredential({
      organizationId: params.organizationId,
      id: params.id,
    });
    if (!connection) throw new LangfuseNotFoundError("Provider credential");
    return testGatewayModel({
      provider: connection.provider as GatewayProviderName,
      config: connection.config,
      baseURL: connection.baseURL,
      extraHeaders: decryptAndParseExtraHeaders(connection.extraHeaders) ?? {},
      credential: decrypt(connection.encryptedCredential),
      model: params.model,
    });
  }

  async addCustomModel(params: CustomModelChange) {
    const existing = await this.get({
      organizationId: params.organizationId,
      id: params.id,
    });
    if (existing.customModels.some(({ id }) => id === params.model)) {
      return existing;
    }
    // A connection restricted to some models would otherwise list the new model disabled.
    const allowedModels =
      existing.allowedModels === null
        ? null
        : [...new Set([...existing.allowedModels, params.model])];
    return this.saveCustomModels({
      ...params,
      existing,
      allowedModels,
      customModels: [...existing.customModels, { id: params.model }],
    });
  }

  async removeCustomModel(params: CustomModelChange) {
    const existing = await this.get({
      organizationId: params.organizationId,
      id: params.id,
    });
    const allowedModels =
      existing.allowedModels === null
        ? null
        : existing.allowedModels.filter((model) => model !== params.model);
    return this.saveCustomModels({
      ...params,
      existing,
      allowedModels,
      customModels: existing.customModels.filter(
        ({ id }) => id !== params.model,
      ),
    });
  }

  private async saveCustomModels(
    params: CustomModelChange & {
      existing: Awaited<ReturnType<GatewayProviderService["get"]>>;
      allowedModels: string[] | null;
      customModels: GatewayCustomModel[];
    },
  ) {
    const updated = await this.repository.updateAllowedModels({
      organizationId: params.organizationId,
      id: params.id,
      expectedUpdatedAt: params.expectedUpdatedAt,
      allowedModels: params.allowedModels,
      customModels: params.customModels,
    });
    if (!updated) {
      throw new LangfuseConflictError(
        "Model access changed while this page was open. Reload and try again.",
      );
    }
    await this.modelCatalogService.clearModelCache(
      params.organizationId,
      params.id,
    );
    await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayAiConnection",
        resourceId: params.id,
        action: "update",
        before: params.existing,
        after: updated,
      },
      this.prisma,
    );
    return updated;
  }
}

type CustomModelChange = {
  organizationId: string;
  id: string;
  model: string;
  expectedUpdatedAt: Date;
  session: OrgAuthedContext["session"];
};

function rethrowConnectionMutationError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new InvalidRequestError(GATEWAY_CONNECTION_NAME_ERRORS.duplicate);
  }
  throw error;
}

// Bedrock keeps its region in `config`; other providers have no config.
function parseConnectionConfig(
  provider: GatewayProvider,
  config: GatewayBedrockConfig | undefined,
) {
  if (provider !== "BEDROCK") return null;
  if (!config) {
    throw new InvalidRequestError(
      "Amazon Bedrock connections need an AWS region",
    );
  }
  return config;
}

type ConnectionEndpoint = {
  baseURL: string | null;
  extraHeaders: Record<string, string> | null;
};

// Bedrock only reaches its regional AWS endpoints.
async function parseConnectionEndpoint(
  params: ConnectionEndpoint & { provider: GatewayProvider },
): Promise<ConnectionEndpoint> {
  const extraHeaders =
    params.extraHeaders && Object.keys(params.extraHeaders).length > 0
      ? params.extraHeaders
      : null;
  if (params.provider === "BEDROCK" && (params.baseURL || extraHeaders)) {
    throw new InvalidRequestError(
      "Amazon Bedrock connections do not support a custom base URL or extra headers",
    );
  }
  if (extraHeaders) assertValidExtraHeaders(extraHeaders);
  const baseURL = toCanonicalBaseURL(params.provider, params.baseURL);
  if (baseURL) {
    try {
      await validateLlmConnectionBaseURL(baseURL);
    } catch (error) {
      throw new InvalidRequestError(
        `Invalid base URL: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
  return { baseURL, extraHeaders };
}

/**
 * Model discovery, model tests and the gateway append route paths such as
 * `/models` verbatim, so the stored URL ends at the API version. Anthropic
 * URLs take `/v1` like LLM connections, and the gateway rejects query strings,
 * fragments and the `{model}` placeholder LLM connections allow.
 */
function toCanonicalBaseURL(
  provider: GatewayProvider,
  baseURL: string | null,
): string | null {
  if (!baseURL) return null;
  if (/[?#]/.test(baseURL) || baseURL.includes("{model}")) {
    throw new InvalidRequestError(
      "Invalid base URL: query strings, fragments and {model} are not supported",
    );
  }
  const trimmed = baseURL.replace(/\/+$/, "");
  return provider === "ANTHROPIC" && !trimmed.endsWith("/v1")
    ? `${trimmed}/v1`
    : trimmed;
}

function toStoredEndpoint(endpoint: ConnectionEndpoint) {
  return {
    baseURL: endpoint.baseURL,
    extraHeaders: endpoint.extraHeaders
      ? encrypt(JSON.stringify(endpoint.extraHeaders))
      : null,
    extraHeaderKeys: Object.keys(endpoint.extraHeaders ?? {}),
  };
}

function toStoredCredential(provider: GatewayProvider, credential: string) {
  return provider === "BEDROCK"
    ? encodeBedrockCredential(credential)
    : credential;
}

async function validateGatewayCredential(
  params: {
    provider: GatewayProviderName;
    credential: string;
    config: GatewayBedrockConfig | null;
  } & ConnectionEndpoint,
): Promise<GatewayCredentialValidation> {
  // Listing models proves the key and region without depending on which
  // models the AWS account has been granted. A denied list call still proves
  // the key authenticated, since least-privilege keys may only invoke models.
  if (params.provider === "BEDROCK") {
    const result = await getModelDiscoveryAdapter("BEDROCK").fetchCatalog({
      credential: encodeBedrockCredential(params.credential),
      config: params.config,
      baseURL: null,
      extraHeaders: {},
      fetcher: getGatewayFetch({
        baseURL: null,
        extraHeaders: {},
        logContext: "AI Gateway Bedrock credential validation",
      }),
    });
    if (!result.success) {
      throw new InvalidRequestError("Provider credential validation failed");
    }
    return { modelListingDenied: result.modelListingDenied ?? false };
  }

  const definition = getGatewayProviderDefinition(params.provider);
  const adapter =
    params.provider === "ANTHROPIC" ? LLMAdapter.Anthropic : LLMAdapter.OpenAI;
  const model = definition.validationModel;

  try {
    await testModelCall({
      provider: params.provider.toLowerCase(),
      model,
      apiKey: {
        id: "gateway-credential-validation",
        projectId: "gateway-credential-validation",
        createdAt: new Date(0),
        updatedAt: new Date(0),
        adapter,
        provider: params.provider.toLowerCase(),
        displaySecretKey: "",
        secretKey: encrypt(params.credential),
        ...toStoredEndpoint(params),
        baseURL: params.baseURL ?? definition.baseUrl,
        customModels: [],
        withDefaultModels: true,
        config: null,
      },
      timeout: 10_000,
    });
  } catch {
    throw new InvalidRequestError("Provider credential validation failed");
  }
  return { modelListingDenied: false };
}

type CredentialValidator = (
  params: {
    provider: GatewayProviderName;
    credential: string;
    config: GatewayBedrockConfig | null;
  } & ConnectionEndpoint,
) => Promise<GatewayCredentialValidation>;

type GatewayCredentialValidation = { modelListingDenied: boolean };
