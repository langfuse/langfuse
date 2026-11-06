import type {
  GatewayConnectionStatus,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import {
  decryptAndParseExtraHeaders,
  logger,
  redis as defaultRedis,
} from "@langfuse/shared/src/server";
import type { Cluster, Redis } from "ioredis";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { invalidateGatewayResolveCacheForOrganization } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import {
  type GatewayProviderName,
  gatewayProviders,
} from "@/src/features/ai-gateway/server/provider/registry";
import { getGatewayFetch } from "@/src/features/ai-gateway/server/provider/getGatewayFetch";
import { GatewayProviderRepository } from "../connection/gatewayProviderRepository";
import {
  type GatewayModelCatalogEntry,
  type ModelDiscoveryError,
  getModelDiscoveryAdapter,
} from "./modelDiscoveryRegistry";

export type { GatewayModelCatalogEntry } from "./modelDiscoveryRegistry";

type ModelRefreshError = {
  connectionId: string;
  success: false;
  error: ModelDiscoveryError;
};

export type ModelRefreshResult =
  | {
      connectionId: string;
      success: true;
      models: string[];
      modelListingDenied?: boolean;
    }
  | ModelRefreshError;

export type ModelCatalogRefreshResult =
  | {
      connectionId: string;
      success: true;
      models: GatewayModelCatalogEntry[];
      /** The credential may not list provider models, so only custom models are known. */
      modelListingDenied?: boolean;
    }
  | ModelRefreshError;

const MODEL_CACHE_PREFIX = "ai-gateway:models";
const MODEL_CACHE_REFRESH_LOCK_PREFIX = "ai-gateway:models-refresh";
const MODEL_CACHE_TTL_SECONDS = 5 * 60;
/**
 * A cached catalog this close to expiry is still served but refreshed in the background.
 * The refresh lock lives exactly as long, so each connection gets at most one refresh per window.
 */
const MODEL_CACHE_REFRESH_WINDOW_SECONDS = 30;
/**
 * Codex sends its auto-review requests as `codex-auto-review`, which OpenAI serves but does not list in `/v1/models`.
 * Listing it here keeps it allowed by default on every OpenAI connection while admins can still disable it.
 */
const CUSTOM_MODELS: Partial<Record<GatewayProviderName, string[]>> = {
  OPENAI: ["codex-auto-review"],
};

export class GatewayModelCatalogService {
  private readonly repository: GatewayProviderRepository;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis | Cluster | null = defaultRedis,
  ) {
    this.repository = new GatewayProviderRepository(prisma);
  }

  async refreshAllModels(
    organizationId: string,
    forceRefresh = false,
  ): Promise<ModelRefreshResult[]> {
    const connections = await this.listAllConnections(
      organizationId,
      "ENABLED",
    );
    return Promise.all(
      connections.map((connection) =>
        this.refreshConnectionModels({
          organizationId,
          connectionId: connection.id,
          forceRefresh,
          explicitRetry: false,
          readOnly: false,
        }),
      ),
    );
  }

  /** Discovers models without changing connection status and with bounded provider calls, so read-only roles may call it. */
  async listAllModels(organizationId: string): Promise<ModelRefreshResult[]> {
    const connections = await this.listAllConnections(
      organizationId,
      "ENABLED",
    );
    return Promise.all(
      connections.map((connection) =>
        this.refreshConnectionModels({
          organizationId,
          connectionId: connection.id,
          forceRefresh: false,
          explicitRetry: false,
          readOnly: true,
        }),
      ),
    );
  }

  async listModelConnections(organizationId: string) {
    const connections = await this.listAllConnections(
      organizationId,
      "ENABLED",
    );
    return connections.map(({ id, name, provider, allowedModels }) => ({
      id,
      name,
      provider,
      allowedModels,
    }));
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
      readOnly: false,
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
      readOnly: false,
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

  async getModelCatalog(params: {
    organizationId: string;
    connectionId: string;
  }): Promise<ModelCatalogRefreshResult> {
    return this.refreshConnectionModelCatalog({
      ...params,
      forceRefresh: false,
      explicitRetry: false,
      readOnly: false,
    });
  }

  async clearModelCache(organizationId: string, connectionId: string) {
    if (!this.redis) return;
    try {
      await this.redis.del(this.modelCacheKey(organizationId, connectionId));
    } catch {
      // Redis is optional. Credential updates still succeed when it is unavailable.
    }
  }

  private async listAllConnections(
    organizationId: string,
    status?: GatewayConnectionStatus,
  ) {
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

  private async refreshConnectionModels(
    params: CatalogRefreshParams,
  ): Promise<ModelRefreshResult> {
    const result = await this.refreshConnectionModelCatalog(params);
    return result.success
      ? {
          connectionId: result.connectionId,
          success: true,
          models: result.models.map(({ id }) => id),
          modelListingDenied: result.modelListingDenied,
        }
      : result;
  }

  private async refreshConnectionModelCatalog(
    params: CatalogRefreshParams,
  ): Promise<ModelCatalogRefreshResult> {
    if (params.forceRefresh) {
      await this.clearModelCache(params.organizationId, params.connectionId);
    } else {
      const cached = await this.getCachedModels(
        params.organizationId,
        params.connectionId,
      );
      if (cached) {
        if (cached.expiresInSeconds <= MODEL_CACHE_REFRESH_WINDOW_SECONDS) {
          this.refreshInBackground(params);
        }
        return {
          connectionId: params.connectionId,
          success: true,
          models: cached.catalog.models,
          modelListingDenied: cached.catalog.modelListingDenied,
        };
      }
    }

    const connection = await this.repository.getConnectionWithCredential({
      organizationId: params.organizationId,
      id: params.connectionId,
    });
    if (!connection) throw new LangfuseNotFoundError("Provider credential");
    return params.readOnly
      ? this.discoverModelsReadOnly(connection, params)
      : this.discoverModels(connection, params);
  }

  /**
   * Read-only roles reach the provider at most once per refresh window, even when discovery fails,
   * because a failure keeps the connection ENABLED and is not cached. Otherwise they see the allowlist.
   */
  private async discoverModelsReadOnly(
    connection: ConnectionWithCredential,
    params: CatalogRefreshParams,
  ): Promise<ModelCatalogRefreshResult> {
    const allowedModels = {
      connectionId: connection.id,
      success: true as const,
      models: (connection.allowedModels ?? []).map((id) =>
        toCatalogEntry(connection.provider as GatewayProviderName, id),
      ),
    };
    if (!(await this.claimRefresh(params.organizationId, connection.id))) {
      return allowedModels;
    }
    const result = await this.discoverModels(connection, params);
    if (result.success) return result;
    logDiscoveryFailure(params, result.error);
    return allowedModels;
  }

  private async refreshInBackground(params: CatalogRefreshParams) {
    try {
      if (
        !(await this.claimRefresh(params.organizationId, params.connectionId))
      ) {
        return;
      }
      const connection = await this.repository.getConnectionWithCredential({
        organizationId: params.organizationId,
        id: params.connectionId,
      });
      if (!connection) return;
      const result = await this.discoverModels(connection, params);
      if (!result.success) logDiscoveryFailure(params, result.error);
    } catch (error) {
      logDiscoveryFailure(params, error);
    }
  }

  private async discoverModels(
    connection: ConnectionWithCredential,
    params: CatalogRefreshParams,
  ): Promise<ModelCatalogRefreshResult> {
    const provider = connection.provider as GatewayProviderName;
    const credential = decrypt(connection.encryptedCredential);
    const extraHeaders =
      decryptAndParseExtraHeaders(connection.extraHeaders) ?? {};
    const models = await getModelDiscoveryAdapter(provider).fetchCatalog({
      credential,
      config: connection.config,
      baseURL: connection.baseURL,
      extraHeaders,
      fetcher: getGatewayFetch({
        baseURL: connection.baseURL,
        extraHeaders,
        logContext: "AI Gateway model discovery",
      }),
    });
    if (!models.success) {
      // A proxy may serve inference yet reject its models route, so only the
      // official origins treat a rejected listing as a bad credential.
      if (
        !params.readOnly &&
        models.error === "unauthorized" &&
        !connection.baseURL &&
        connection.status === "ENABLED"
      ) {
        const marked = await this.repository.updateConnectionStatus({
          organizationId: params.organizationId,
          id: connection.id,
          status: "ERROR",
          expectedUpdatedAt: connection.updatedAt,
        });
        // A connection that just failed authorization must stop being handed
        // to the data plane.
        if (marked) {
          await invalidateGatewayResolveCacheForOrganization(
            params.organizationId,
          );
        }
      }
      return {
        connectionId: connection.id,
        success: false,
        error: models.error,
      };
    }
    const catalog = addCustomModels(
      provider,
      models.models,
      connection.customModels.map(({ id }) => id),
    );
    // Discovery can outlast a credential update, whose catalog must not be overwritten by the old one.
    const unchanged = await this.repository.isConnectionUnchanged({
      organizationId: params.organizationId,
      id: connection.id,
      updatedAt: connection.updatedAt,
    });
    if (unchanged) {
      await this.cacheModels(
        params.organizationId,
        params.connectionId,
        { models: catalog, modelListingDenied: models.modelListingDenied },
        models.expiresAt,
      );
    }
    if (unchanged && params.explicitRetry && connection.status === "ERROR") {
      const enabled = await this.repository.updateConnectionStatus({
        organizationId: params.organizationId,
        id: connection.id,
        status: "ENABLED",
        expectedUpdatedAt: connection.updatedAt,
      });
      if (enabled) {
        await invalidateGatewayResolveCacheForOrganization(
          params.organizationId,
        );
      }
    }
    return {
      connectionId: connection.id,
      success: true,
      models: catalog,
      modelListingDenied: models.modelListingDenied,
    };
  }

  private modelCacheKey(organizationId: string, connectionId: string) {
    return `${MODEL_CACHE_PREFIX}:${organizationId}:${connectionId}`;
  }

  private async getCachedModels(organizationId: string, connectionId: string) {
    if (!this.redis) return null;
    try {
      const key = this.modelCacheKey(organizationId, connectionId);
      const [cached, expiresInSeconds] = await Promise.all([
        this.redis.get(key),
        this.redis.ttl(key),
      ]);
      if (!cached) return null;
      const catalog = toCachedCatalog(JSON.parse(cached));
      return catalog ? { catalog, expiresInSeconds } : null;
    } catch {
      return null;
    }
  }

  /** Cross-instance guard so concurrent requests trigger a single provider call per refresh window. */
  private async claimRefresh(organizationId: string, connectionId: string) {
    if (!this.redis) return true;
    try {
      const claimed = await this.redis.set(
        `${MODEL_CACHE_REFRESH_LOCK_PREFIX}:${organizationId}:${connectionId}`,
        "1",
        "EX",
        MODEL_CACHE_REFRESH_WINDOW_SECONDS,
        "NX",
      );
      return claimed === "OK";
    } catch {
      // Redis is optional. Without it discovery proceeds without deduplication.
      return true;
    }
  }

  private async cacheModels(
    organizationId: string,
    connectionId: string,
    catalog: CachedCatalog,
    expiresAt: number | undefined,
  ) {
    if (!this.redis) return;
    // A model must leave the cached catalog at its shutdown, not up to a full TTL later.
    const ttlSeconds =
      expiresAt === undefined
        ? MODEL_CACHE_TTL_SECONDS
        : Math.min(
            MODEL_CACHE_TTL_SECONDS,
            Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)),
          );
    try {
      await this.redis.setex(
        this.modelCacheKey(organizationId, connectionId),
        ttlSeconds,
        JSON.stringify(catalog),
      );
    } catch {
      // Redis is optional. Provider discovery still succeeds when it is unavailable.
    }
  }
}

function addCustomModels(
  provider: GatewayProviderName,
  models: GatewayModelCatalogEntry[],
  connectionCustomModels: readonly string[],
): GatewayModelCatalogEntry[] {
  const discoveredIds = new Set(models.map(({ id }) => id));
  const customIds = new Set([
    ...(CUSTOM_MODELS[provider] ?? []),
    ...connectionCustomModels,
  ]);
  const customModels = [...customIds]
    .filter((id) => !discoveredIds.has(id))
    .map((id) => toCatalogEntry(provider, id));
  return models.concat(customModels);
}

function logDiscoveryFailure(params: CatalogRefreshParams, error: unknown) {
  logger.warn("Failed to refresh AI Gateway model catalog", {
    organizationId: params.organizationId,
    connectionId: params.connectionId,
    error,
  });
}

function toCatalogEntry(
  provider: GatewayProviderName,
  id: string,
): GatewayModelCatalogEntry {
  return {
    id,
    provider,
    canonicalSlug: id,
    displayName: id,
    createdAt: new Date(0).toISOString(),
  };
}

type CachedCatalog = {
  models: GatewayModelCatalogEntry[];
  modelListingDenied?: boolean;
};

// Entries written before the listing flag existed are bare model arrays.
function toCachedCatalog(value: unknown): CachedCatalog | null {
  if (isGatewayModelCatalog(value)) return { models: value };
  if (
    typeof value !== "object" ||
    value === null ||
    !("models" in value) ||
    !isGatewayModelCatalog(value.models)
  ) {
    return null;
  }
  return {
    models: value.models,
    modelListingDenied:
      "modelListingDenied" in value && value.modelListingDenied === true,
  };
}

function isGatewayModelCatalog(
  value: unknown,
): value is GatewayModelCatalogEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (model) =>
        model &&
        typeof model === "object" &&
        "id" in model &&
        typeof model.id === "string" &&
        "provider" in model &&
        gatewayProviders.includes(model.provider as GatewayProviderName) &&
        "canonicalSlug" in model &&
        typeof model.canonicalSlug === "string" &&
        "displayName" in model &&
        typeof model.displayName === "string" &&
        "createdAt" in model &&
        typeof model.createdAt === "string",
    )
  );
}

type CatalogRefreshParams = {
  organizationId: string;
  connectionId: string;
  forceRefresh: boolean;
  explicitRetry: boolean;
  readOnly: boolean;
};

type ConnectionWithCredential = NonNullable<
  Awaited<ReturnType<GatewayProviderRepository["getConnectionWithCredential"]>>
>;
