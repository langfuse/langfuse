import type { GatewayProvider, PrismaClient } from "@langfuse/shared/src/db";

import { isGatewayEnabledForOrganization } from "@/src/features/ai-gateway/server/availability";
import { GatewayControlPlaneError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";
import {
  type GatewayApiFormat,
  type GatewayMetadata,
  GatewayMetadataSchema,
  gatewayProviders,
  providerSupportsApiFormat,
} from "@/src/features/ai-gateway/server/provider/registry";
import { resolveGatewayModelRoute } from "@/src/features/ai-gateway/fns/gatewayModelSlug";
import {
  type CachedResolveContext,
  GATEWAY_RESOLVE_KEY_NON_EXISTENT,
  GatewayResolveCache,
} from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { GatewayResolveRepository } from "@/src/features/ai-gateway/server/resolve/gatewayResolveRepository";

export type GatewayApiKeyAuthContext = Omit<
  CachedResolveContext,
  "connections"
> & {
  connection: CachedResolveContext["connections"][number] | null;
  providerModel: string | null;
};

type GatewayApiKeyAuthenticatorConfig = {
  resolveCache?: GatewayResolveCache;
};

export class GatewayApiKeyAuthenticator {
  private readonly repository: GatewayResolveRepository;
  private readonly cache: GatewayResolveCache;

  constructor(
    prisma: PrismaClient,
    config: GatewayApiKeyAuthenticatorConfig = {},
  ) {
    this.repository = new GatewayResolveRepository(prisma);
    this.cache = config.resolveCache ?? new GatewayResolveCache();
  }

  async authenticateRequest(params: {
    fastHashedSecretKey: string;
    apiFormat: GatewayApiFormat;
    model: string;
  }): Promise<GatewayApiKeyAuthContext> {
    const context = await this.authenticateKey(params);
    const route = resolveGatewayModelRoute(params.model, context.connections);
    if (!route) {
      throw new GatewayControlPlaneError("Invalid gateway model", 400);
    }

    return {
      ...context,
      providerModel: route.providerModel,
      connection: route.connection,
    };
  }

  async authenticateModelsRequest(params: {
    fastHashedSecretKey: string;
    apiFormat: GatewayApiFormat;
  }): Promise<GatewayApiKeyAuthContext> {
    const context = await this.authenticateKey(params);
    return {
      ...context,
      providerModel: null,
      connection: null,
    };
  }

  private async authenticateKey(params: {
    fastHashedSecretKey: string;
    apiFormat: GatewayApiFormat;
  }): Promise<CachedResolveContext> {
    const cacheParams = {
      fastHashedSecretKey: params.fastHashedSecretKey,
      apiFormat: params.apiFormat,
    };
    const cached = await this.cache.get(cacheParams);
    if (cached === GATEWAY_RESOLVE_KEY_NON_EXISTENT) {
      throw new GatewayControlPlaneError("Invalid gateway key", 401);
    }

    const context = cached ?? (await this.loadAndCacheContext(cacheParams));

    // Re-check on cache hits so removing an organization from the allowlist
    // takes effect without waiting for the cache TTL.
    if (!isGatewayEnabledForOrganization(context.organizationId)) {
      throw new GatewayControlPlaneError(
        "Gateway is not enabled for this organization",
        403,
      );
    }
    return context;
  }

  private async loadAndCacheContext(params: {
    fastHashedSecretKey: string;
    apiFormat: GatewayApiFormat;
  }): Promise<CachedResolveContext> {
    const row = await this.repository.resolveContext({
      fastHashedSecretKey: params.fastHashedSecretKey,
      providers: supportedProviders(params.apiFormat),
    });

    const organizationId = row?.apiKey.orgId;
    const organization = row?.apiKey.organization;
    if (!row || !organizationId || !organization) {
      await this.cache.set({
        fastHashedSecretKey: params.fastHashedSecretKey,
        apiFormat: params.apiFormat,
        context: GATEWAY_RESOLVE_KEY_NON_EXISTENT,
      });
      throw new GatewayControlPlaneError("Invalid gateway key", 401);
    }

    const gatewayConfig = organization.gatewayConfig;
    const project = gatewayConfig?.defaultIngestionProject;
    const projectIsUsable =
      Boolean(project) &&
      !project?.deletedAt &&
      project?.orgId === organizationId;
    const context: CachedResolveContext = {
      organizationId,
      apiKeyId: row.apiKeyId,
      keyMetadata: toKeyMetadata(row.metadata),
      ingestionProjectId: projectIsUsable
        ? (gatewayConfig?.defaultIngestionProjectId ?? null)
        : null,
      ingestionMode: gatewayConfig?.ingestionMode ?? null,
      connections: organization.gatewayAiConnections,
    };

    await this.cache.set({
      fastHashedSecretKey: params.fastHashedSecretKey,
      apiFormat: params.apiFormat,
      context,
      expiresAt: row.apiKey.expiresAt,
    });
    return context;
  }
}

function supportedProviders(apiFormat: GatewayApiFormat): GatewayProvider[] {
  return gatewayProviders.filter((provider) =>
    providerSupportsApiFormat(provider, apiFormat),
  ) as GatewayProvider[];
}

// The column is JSON, so a key written before validation existed can hold a
// scalar, an array, or nested objects. Only a flat object of scalars can be
// attributed per event.
function toKeyMetadata(value: unknown): GatewayMetadata {
  const parsed = GatewayMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}
