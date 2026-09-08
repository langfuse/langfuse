import type {
  GatewayConnectionStatus,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import { redis as defaultRedis } from "@langfuse/shared/src/server";
import type { Cluster, Redis } from "ioredis";

import { auditLog } from "@/src/features/audit-logs/server";
import { invalidateGatewayResolveCacheForOrganization } from "@/src/features/llm-gateway/server/resolve/gatewayResolveCache";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import {
  type GatewayProviderName,
  gatewayProviders,
} from "@/src/features/llm-gateway/server/provider/registry";
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
  | { connectionId: string; success: true; models: string[] }
  | ModelRefreshError;

export type ModelCatalogRefreshResult =
  | {
      connectionId: string;
      success: true;
      models: GatewayModelCatalogEntry[];
    }
  | ModelRefreshError;

const MODEL_CACHE_PREFIX = "llm-gateway:models";
const MODEL_CACHE_TTL_SECONDS = 5 * 60;

export class GatewayModelCatalogService {
  private readonly repository: GatewayProviderRepository;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly fetcher: typeof fetch = fetch,
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

  async getModelCatalog(params: {
    organizationId: string;
    connectionId: string;
  }): Promise<ModelCatalogRefreshResult> {
    return this.refreshConnectionModelCatalog({
      ...params,
      forceRefresh: false,
      explicitRetry: false,
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

  private async refreshConnectionModels(params: {
    organizationId: string;
    connectionId: string;
    forceRefresh: boolean;
    explicitRetry: boolean;
  }): Promise<ModelRefreshResult> {
    const result = await this.refreshConnectionModelCatalog(params);
    return result.success
      ? {
          connectionId: result.connectionId,
          success: true,
          models: result.models.map(({ id }) => id),
        }
      : result;
  }

  private async refreshConnectionModelCatalog(params: {
    organizationId: string;
    connectionId: string;
    forceRefresh: boolean;
    explicitRetry: boolean;
  }): Promise<ModelCatalogRefreshResult> {
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

    const provider = connection.provider as GatewayProviderName;
    const credential = decrypt(connection.encryptedCredential);
    const models = await getModelDiscoveryAdapter(provider).fetchCatalog({
      credential,
      fetcher: this.fetcher,
    });
    if (!models.success) {
      if (models.error === "unauthorized") {
        await this.repository.updateConnectionStatus({
          organizationId: params.organizationId,
          id: connection.id,
          status: "ERROR",
        });
        // A connection that just failed authorization must stop being handed
        // to the data plane.
        await invalidateGatewayResolveCacheForOrganization(
          params.organizationId,
        );
      }
      return {
        connectionId: connection.id,
        success: false,
        error: models.error,
      };
    }
    await this.cacheModels(
      params.organizationId,
      params.connectionId,
      models.models,
    );
    if (params.explicitRetry && connection.status === "ERROR") {
      await this.repository.updateConnectionStatus({
        organizationId: params.organizationId,
        id: connection.id,
        status: "ENABLED",
      });
      await invalidateGatewayResolveCacheForOrganization(params.organizationId);
    }
    return {
      connectionId: connection.id,
      success: true,
      models: models.models,
    };
  }

  private modelCacheKey(organizationId: string, connectionId: string) {
    return `${MODEL_CACHE_PREFIX}:${organizationId}:${connectionId}`;
  }

  private async getCachedModels(
    organizationId: string,
    connectionId: string,
  ): Promise<GatewayModelCatalogEntry[] | null> {
    if (!this.redis) return null;
    try {
      const cached = await this.redis.get(
        this.modelCacheKey(organizationId, connectionId),
      );
      if (!cached) return null;
      const parsed: unknown = JSON.parse(cached);
      return isGatewayModelCatalog(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private async cacheModels(
    organizationId: string,
    connectionId: string,
    models: GatewayModelCatalogEntry[],
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
        gatewayProviders.includes(model.provider as GatewayProviderName),
    )
  );
}
