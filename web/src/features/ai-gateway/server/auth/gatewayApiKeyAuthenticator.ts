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
import {
  type CachedResolveContext,
  GATEWAY_RESOLVE_KEY_NON_EXISTENT,
  GatewayResolveCache,
} from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { GatewayResolveRepository } from "@/src/features/ai-gateway/server/resolve/gatewayResolveRepository";

export type GatewayApiKeyAuthContext = CachedResolveContext;

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
  }): Promise<GatewayApiKeyAuthContext> {
    const cached = await this.cache.get(params);
    if (cached === GATEWAY_RESOLVE_KEY_NON_EXISTENT) {
      throw new GatewayControlPlaneError("Invalid gateway key", 401);
    }

    const context = cached ?? (await this.loadAndCacheContext(params));

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
  }): Promise<GatewayApiKeyAuthContext> {
    const row = await this.repository.resolveContext({
      fastHashedSecretKey: params.fastHashedSecretKey,
      providers: supportedProviders(params.apiFormat),
    });

    const organizationId = row?.apiKey.orgId;
    const organization = row?.apiKey.organization;
    if (!row || !organizationId || !organization) {
      await this.cache.set({
        ...params,
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
    const connection = organization.gatewayAiConnections[0];

    const context: GatewayApiKeyAuthContext = {
      organizationId,
      apiKeyId: row.apiKeyId,
      keyMetadata: toKeyMetadata(row.metadata),
      ingestionProjectId: projectIsUsable
        ? (gatewayConfig?.defaultIngestionProjectId ?? null)
        : null,
      ingestionMode: gatewayConfig?.ingestionMode ?? null,
      connection: connection
        ? {
            id: connection.id,
            provider: connection.provider,
            encryptedCredential: connection.encryptedCredential,
          }
        : null,
    };

    await this.cache.set({ ...params, context });
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
