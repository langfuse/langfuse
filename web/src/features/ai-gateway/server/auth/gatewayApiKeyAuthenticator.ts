import type { GatewayProvider, PrismaClient } from "@langfuse/shared/src/db";
import { ApiKeyId, OrganizationId } from "@langfuse/shared/rbac";

import { authorize } from "@/src/features/rbac/authorize";
import { getRolesForPrincipal } from "@/src/features/rbac/getRolesForPrincipal";
import { isGatewayEnabledForOrganization } from "@/src/features/ai-gateway/server/availability";
import { GatewayControlPlaneError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";
import {
  type GatewayApiFormat,
  type GatewayMetadata,
  GatewayMetadataSchema,
  gatewayProviders,
  providerSupportsApiFormat,
} from "@/src/features/ai-gateway/server/provider/registry";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { parseGatewayAllowedModels } from "@/src/features/ai-gateway/fns/parseGatewayAllowedModels";
import { GatewayModelRoutingService } from "@/src/features/ai-gateway/server/routing/gatewayModelRoutingService";
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
  private readonly modelRoutingService = new GatewayModelRoutingService();

  constructor(
    private readonly prisma: PrismaClient,
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
    const route = this.modelRoutingService.resolve(
      params.model,
      context.connections,
    );
    if (!route) {
      throw new GatewayControlPlaneError("Invalid gateway model", 400);
    }
    if (
      route.connection &&
      !isGatewayModelAllowed(
        route.connection.allowedModels,
        route.providerModel,
      )
    ) {
      throw new GatewayControlPlaneError(
        "Model is not allowed for this provider connection",
        403,
        "model_not_allowed",
      );
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

    const organizationId = row?.orgId;
    const organization = row?.organization;
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
      apiKeyId: row.id,
      userId: row.userId,
      apiKeyName: row.note || null,
      userName: row.user?.name || null,
      keyMetadata: toKeyMetadata(row.gatewayAssociation?.metadata),
      ingestionProjectId: projectIsUsable
        ? (gatewayConfig?.defaultIngestionProjectId ?? null)
        : null,
      ingestionMode: gatewayConfig?.ingestionMode ?? null,
      connections: organization.gatewayAiConnections.map((connection) => ({
        ...connection,
        allowedModels: parseGatewayAllowedModels(connection.allowedModels),
      })),
    };

    // Any organization key may call the gateway when its roles grant
    // gateway:invoke, so this check must not depend on API_AUTH_MIGRATION.
    await assertCanInvokeGateway(this.prisma, row.id, organizationId);

    await this.cache.set({
      fastHashedSecretKey: params.fastHashedSecretKey,
      apiFormat: params.apiFormat,
      context,
      expiresAt: row.expiresAt,
    });
    return context;
  }
}

/** assertCanInvokeGateway denies the key when its stored roles do not grant gateway:invoke on the organization. */
async function assertCanInvokeGateway(
  prisma: PrismaClient,
  apiKeyId: string,
  organizationId: string,
) {
  const roles = await getRolesForPrincipal(prisma, ApiKeyId(apiKeyId));
  const tenant = OrganizationId(organizationId);
  const allowed = authorize(
    {
      principal: {
        kind: "apiKey",
        apiKeyId,
        userId: null,
        isInAppAgentKey: false,
        publicKey: "",
        scope: "ORGANIZATION",
        presentation: "privateKey",
        organizations: [],
        boundResource: { orgId: organizationId },
      },
      policies: roles.flatMap((role) => role.policies),
    },
    tenant,
    "gateway:invoke",
    tenant,
  ).success;
  if (!allowed) {
    throw new GatewayControlPlaneError(
      "API key is not allowed to invoke the gateway",
      403,
    );
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
