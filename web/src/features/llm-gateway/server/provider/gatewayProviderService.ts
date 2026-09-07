import type {
  GatewayConnectionStatus,
  GatewayProvider,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import {
  LLMAdapter,
  redis as defaultRedis,
  testModelCall,
} from "@langfuse/shared/src/server";
import { getDisplaySecretKey } from "@langfuse/shared/src/server/auth/apiKeys";
import type { Cluster, Redis } from "ioredis";

import { auditLog } from "@/src/features/audit-logs/server";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import {
  type GatewayProviderName,
  getGatewayProviderDefinition,
} from "./providerRegistry";
import { GatewayProviderRepository } from "./gatewayProviderRepository";

type ModelRefreshResult =
  | { connectionId: string; success: true; models: string[] }
  | {
      connectionId: string;
      success: false;
      error: "unauthorized" | "rate_limited" | "provider_error" | "timeout";
    };

type CredentialValidator = (params: {
  provider: GatewayProviderName;
  credential: string;
}) => Promise<void>;

const MODEL_CACHE_PREFIX = "llm-gateway:models";
const MODEL_CACHE_TTL_SECONDS = 5 * 60;

export class GatewayProviderService {
  private readonly repository: GatewayProviderRepository;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly fetcher: typeof fetch = fetch,
    private readonly validateCredential: CredentialValidator = validateGatewayCredential,
    private readonly redis: Redis | Cluster | null = defaultRedis,
  ) {
    this.repository = new GatewayProviderRepository(prisma);
  }

  list(params: { organizationId: string; cursor?: string; limit: number }) {
    return this.repository.listConnections(params);
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

  async create(params: {
    organizationId: string;
    name: string;
    provider: GatewayProvider;
    credential: string;
    session: OrgAuthedContext["session"];
  }) {
    await this.validateCredential({
      provider: params.provider,
      credential: params.credential,
    });
    const connection = await this.repository.createConnection({
      organizationId: params.organizationId,
      name: params.name,
      provider: params.provider,
      encryptedCredential: encrypt(params.credential),
      displaySecret: getDisplaySecretKey(params.credential),
      createdById: params.session.user.id,
      status: "ENABLED",
    });
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
    return connection;
  }

  async update(params: {
    organizationId: string;
    id: string;
    name?: string;
    credential?: string;
    status?: GatewayConnectionStatus;
    session: OrgAuthedContext["session"];
  }) {
    const existing = await this.repository.getSafeConnection({
      organizationId: params.organizationId,
      id: params.id,
    });
    if (!existing) throw new LangfuseNotFoundError("Gateway connection");
    if (
      existing.status === "ERROR" &&
      params.status === "ENABLED" &&
      !params.credential
    ) {
      throw new InvalidRequestError(
        "Errored gateway connections require a credential update or successful retry",
      );
    }
    if (params.credential) {
      await this.validateCredential({
        provider: existing.provider,
        credential: params.credential,
      });
    }

    const updated = await this.repository.updateConnection({
      organizationId: params.organizationId,
      id: params.id,
      name: params.name,
      status: params.credential ? "ENABLED" : params.status,
      encryptedCredential: params.credential
        ? encrypt(params.credential)
        : undefined,
      displaySecret: params.credential
        ? getDisplaySecretKey(params.credential)
        : undefined,
    });
    await this.clearModelCache(params.organizationId, params.id);
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

  async delete(params: {
    organizationId: string;
    id: string;
    session: OrgAuthedContext["session"];
  }) {
    const deleted = await this.repository.deleteConnection(params);
    await this.clearModelCache(params.organizationId, params.id);
    const remaining = await this.listAll(params.organizationId);
    await this.repository.reorderConnections({
      organizationId: params.organizationId,
      connectionIds: remaining.map((connection) => connection.id),
    });
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

  async reorder(params: {
    organizationId: string;
    connectionIds: string[];
    session: OrgAuthedContext["session"];
  }) {
    const existing = await this.listAll(params.organizationId);
    const existingIds = new Set(existing.map((connection) => connection.id));
    const requestedIds = new Set(params.connectionIds);
    if (
      requestedIds.size !== params.connectionIds.length ||
      requestedIds.size !== existingIds.size ||
      params.connectionIds.some((id) => !existingIds.has(id))
    ) {
      throw new InvalidRequestError(
        "Reorder must contain every organization gateway connection exactly once",
      );
    }
    await this.repository.reorderConnections(params);
    const reordered = await this.listAll(params.organizationId);
    await auditLog(
      {
        session: params.session,
        resourceType: "gatewayAiConnection",
        resourceId: params.organizationId,
        action: "reorder",
        before: existing,
        after: reordered,
      },
      this.prisma,
    );
    return reordered;
  }

  async refreshAllModels(
    organizationId: string,
    forceRefresh = false,
  ): Promise<ModelRefreshResult[]> {
    const connections = await this.listAll(organizationId, "ENABLED");
    return Promise.all(
      connections.map((connection) =>
        this.refreshConnectionModels({
          organizationId,
          connectionId: connection.id,
          forceRefresh,
          explicitRetry: false,
        }),
      ),
    );
  }

  async refreshModels(params: {
    organizationId: string;
    connectionId: string;
    forceRefresh?: boolean;
  }): Promise<ModelRefreshResult> {
    return this.refreshConnectionModels({
      ...params,
      forceRefresh: params.forceRefresh ?? false,
      explicitRetry: false,
    });
  }

  async retryConnection(params: {
    organizationId: string;
    connectionId: string;
    session: OrgAuthedContext["session"];
  }): Promise<ModelRefreshResult> {
    const result = await this.refreshConnectionModels({
      organizationId: params.organizationId,
      connectionId: params.connectionId,
      forceRefresh: true,
      explicitRetry: true,
    });
    if (result.success) {
      await auditLog(
        {
          session: params.session,
          resourceType: "gatewayAiConnection",
          resourceId: params.connectionId,
          action: "retry",
        },
        this.prisma,
      );
    }
    return result;
  }

  private async refreshConnectionModels(params: {
    organizationId: string;
    connectionId: string;
    forceRefresh: boolean;
    explicitRetry: boolean;
  }): Promise<ModelRefreshResult> {
    const connection = await this.repository.getConnectionWithCredential({
      organizationId: params.organizationId,
      id: params.connectionId,
    });
    if (!connection) throw new LangfuseNotFoundError("Gateway connection");

    if (params.forceRefresh) {
      await this.clearModelCache(params.organizationId, params.connectionId);
    } else {
      const cachedModels = await this.getCachedModels(
        params.organizationId,
        params.connectionId,
      );
      if (cachedModels) {
        return {
          connectionId: connection.id,
          success: true,
          models: cachedModels,
        };
      }
    }

    const definition = getGatewayProviderDefinition(
      connection.provider as GatewayProviderName,
    );
    const credential = decrypt(connection.encryptedCredential);
    let response: Response;
    try {
      response = await this.fetcher(
        `${definition.baseUrl}${definition.modelsPath}`,
        {
          method: "GET",
          headers:
            definition.authType === "bearer"
              ? { Authorization: `Bearer ${credential}` }
              : {
                  "x-api-key": credential,
                  "anthropic-version": "2023-06-01",
                },
          signal: AbortSignal.timeout(10_000),
          redirect: "error",
        },
      );
    } catch {
      return {
        connectionId: connection.id,
        success: false,
        error: "timeout",
      };
    }

    if (response.status === 401 || response.status === 403) {
      await this.repository.updateConnectionStatus({
        organizationId: params.organizationId,
        id: connection.id,
        status: "ERROR",
      });
      return {
        connectionId: connection.id,
        success: false,
        error: "unauthorized",
      };
    }
    if (response.status === 429) {
      return {
        connectionId: connection.id,
        success: false,
        error: "rate_limited",
      };
    }
    if (!response.ok) {
      return {
        connectionId: connection.id,
        success: false,
        error: "provider_error",
      };
    }

    const parsed = await response.json().catch(() => null);
    const models = extractModelIds(parsed);
    await this.cacheModels(params.organizationId, params.connectionId, models);
    if (params.explicitRetry && connection.status === "ERROR") {
      await this.repository.updateConnectionStatus({
        organizationId: params.organizationId,
        id: connection.id,
        status: "ENABLED",
      });
    }
    return { connectionId: connection.id, success: true, models };
  }

  private modelCacheKey(organizationId: string, connectionId: string) {
    return `${MODEL_CACHE_PREFIX}:${organizationId}:${connectionId}`;
  }

  private async getCachedModels(
    organizationId: string,
    connectionId: string,
  ): Promise<string[] | null> {
    if (!this.redis) return null;
    try {
      const cached = await this.redis.get(
        this.modelCacheKey(organizationId, connectionId),
      );
      if (!cached) return null;
      const parsed: unknown = JSON.parse(cached);
      return Array.isArray(parsed) &&
        parsed.every((item) => typeof item === "string")
        ? parsed
        : null;
    } catch {
      return null;
    }
  }

  private async cacheModels(
    organizationId: string,
    connectionId: string,
    models: string[],
  ) {
    if (!this.redis) return;
    try {
      await this.redis.setex(
        this.modelCacheKey(organizationId, connectionId),
        MODEL_CACHE_TTL_SECONDS,
        JSON.stringify(models),
      );
    } catch {
      // Redis is optional. Provider discovery still succeeds when it is unavailable.
    }
  }

  private async clearModelCache(organizationId: string, connectionId: string) {
    if (!this.redis) return;
    try {
      await this.redis.del(this.modelCacheKey(organizationId, connectionId));
    } catch {
      // Redis is optional. Credential updates still succeed when it is unavailable.
    }
  }
}

async function validateGatewayCredential(params: {
  provider: GatewayProviderName;
  credential: string;
}): Promise<void> {
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
        extraHeaders: null,
        extraHeaderKeys: [],
        baseURL: definition.baseUrl,
        customModels: [],
        withDefaultModels: true,
        config: null,
      },
      timeout: 10_000,
    });
  } catch {
    throw new InvalidRequestError("Provider credential validation failed");
  }
}

function extractModelIds(value: unknown): string[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("data" in value) ||
    !Array.isArray(value.data)
  ) {
    return [];
  }
  return value.data
    .map((model) =>
      model && typeof model === "object" && "id" in model
        ? model.id
        : undefined,
    )
    .filter((id): id is string => typeof id === "string")
    .toSorted();
}
