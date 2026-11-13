import {
  ForbiddenError,
  InternalServerError,
  LangfuseConflictError,
  LangfuseNotFoundError,
  type OrderByState,
} from "@langfuse/shared";
import { Prisma, type PrismaClient, type Role } from "@langfuse/shared/src/db";
import {
  createApiKey,
  deleteApiKeyFromDb,
  orgBoundApiKeyScopes,
} from "@langfuse/shared/src/server/auth/apiKeys";
import {
  OrganizationId,
  type OrganizationScope,
  SystemRoleId,
  UserId,
} from "@langfuse/shared/rbac";
import type { Cluster, Redis } from "ioredis";

import { env } from "@/src/env.mjs";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import type { GatewayMetadata } from "@/src/features/ai-gateway/server/provider/registry";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { invalidateGatewayResolveCacheForApiKey } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { GATEWAY_API_KEY_LAST_USED_WINDOW_DAYS } from "@/src/features/ai-gateway/constants/gatewayApiKeyLastUsed";
import { getEffectiveGatewayIngestionMode } from "@/src/features/ai-gateway/fns/gatewayIngestionModePolicy";
import { GatewayConfigRepository } from "@/src/features/ai-gateway/server/config/gatewayConfigRepository";
import { GatewayApiKeyRepository } from "./gatewayApiKeyRepository";
import { getGatewayApiKeysLastUsedAt } from "./gatewayApiKeyLastUsedRepository";

type GatewayApiKeyIssuedAs = "user" | "serviceAccount";

export class GatewayApiKeyService {
  private readonly repository: GatewayApiKeyRepository;
  private readonly configRepository: GatewayConfigRepository;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis?: Redis | Cluster | null,
  ) {
    this.repository = new GatewayApiKeyRepository(prisma);
    this.configRepository = new GatewayConfigRepository(prisma);
  }

  /** Without ownerUserId, lists every gateway key in the organization. */
  list(params: {
    organizationId: string;
    ownerUserId?: string;
    searchQuery?: string;
    orderBy?: OrderByState;
    page: number;
    limit: number;
  }) {
    return this.repository.listGatewayApiKeys(params);
  }

  /**
   * Latest gateway request per key in the last
   * GATEWAY_API_KEY_LAST_USED_WINDOW_DAYS days, read from the organization's
   * gateway ingestion project. Ids the caller cannot list are dropped.
   * `isTracked` is false when gateway traffic is not recorded: ingestion mode
   * `NONE` (which may keep a linked project) or no active ingestion project.
   */
  async getLastUsed(params: {
    organizationId: string;
    ownerUserId?: string;
    apiKeyIds: string[];
  }) {
    const config = await this.configRepository.getConfig(params.organizationId);
    const project = config?.defaultIngestionProject;
    if (
      !config ||
      getEffectiveGatewayIngestionMode(config.ingestionMode) === "NONE" ||
      !project ||
      project.deletedAt ||
      project.orgId !== params.organizationId
    ) {
      return { isTracked: false, apiKeys: [] };
    }
    const apiKeyIds =
      await this.repository.filterVisibleGatewayApiKeyIds(params);
    const since = new Date(
      Date.now() - GATEWAY_API_KEY_LAST_USED_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    return {
      isTracked: true,
      apiKeys: await getGatewayApiKeysLastUsedAt({
        projectId: project.id,
        apiKeyIds,
        since,
      }),
    };
  }

  async create(params: {
    organizationId: string;
    name: string;
    metadata: GatewayMetadata;
    /** Null allows every model the admin enabled. */
    allowedModels?: string[] | null;
    expiresAt?: Date | null;
    /** `user` keys are USER-scoped and also need their creator's roles to allow each call; `serviceAccount` keys belong to the organization. */
    issuedAs: GatewayApiKeyIssuedAs;
    session: OrgAuthedContext["session"];
  }) {
    const key = await this.prisma.$transaction(
      async (tx) => {
        await assertCreatorCanInvokeGateway(tx, params);
        const key = await createApiKey(tx, {
          tenant: OrganizationId(params.organizationId),
          scope:
            params.issuedAs === "serviceAccount"
              ? OrganizationId(params.organizationId)
              : UserId(params.session.user.id),
          role: SystemRoleId("AI_GATEWAY"),
          createdBy: UserId(params.session.user.id),
          name: params.name,
          expiresAt: params.expiresAt,
        });
        await tx.gatewayApiKeyAssociation.create({
          data: {
            apiKeyId: key.id,
            metadata: params.metadata,
            allowedModels: params.allowedModels ?? Prisma.DbNull,
          },
        });
        return key;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await auditLog(
      {
        session: params.session,
        resourceType: "apiKey",
        resourceId: key.id,
        action: "create",
        after: {
          id: key.id,
          publicKey: key.publicKey,
          displaySecretKey: key.displaySecretKey,
          note: key.note,
          expiresAt: params.expiresAt ?? null,
          issuedAs: params.issuedAs,
          allowedModels: params.allowedModels,
        },
      },
      this.prisma,
    );
    return key;
  }

  /** With ownerUserId, another user's key is reported as not found. */
  /** Metadata and model patterns are read per request, so the key's cached context is dropped. */
  async update(params: {
    organizationId: string;
    ownerUserId?: string;
    apiKeyId: string;
    name: string;
    metadata: GatewayMetadata;
    allowedModels: string[] | null;
    previousAllowedModels: string[] | null;
    session: OrgAuthedContext["session"];
  }) {
    const before = await this.repository.getGatewayApiKey(params);
    if (!before) {
      throw new LangfuseNotFoundError("Gateway key not found");
    }
    const updated = await this.repository.updateGatewayApiKey(params);
    const after = await this.repository.getGatewayApiKey(params);
    if (!after) {
      throw new LangfuseNotFoundError("Gateway key not found");
    }
    if (!updated) {
      throw new LangfuseConflictError(
        "The key's models changed since you opened it. Reopen the key and try again.",
      );
    }
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id: params.apiKeyId },
      select: { fastHashedSecretKey: true },
    });
    if (apiKey?.fastHashedSecretKey) {
      await invalidateGatewayResolveCacheForApiKey(apiKey.fastHashedSecretKey);
    }
    await auditLog(
      {
        session: params.session,
        resourceType: "apiKey",
        resourceId: params.apiKeyId,
        action: "update",
        before,
        after,
      },
      this.prisma,
    );
    return after;
  }

  async revoke(params: {
    organizationId: string;
    ownerUserId?: string;
    apiKeyId: string;
    session: OrgAuthedContext["session"];
  }): Promise<void> {
    const association = await this.repository.getGatewayApiKey(params);
    if (!association) {
      throw new LangfuseNotFoundError("Gateway key not found");
    }
    // Read the hash before the row is gone; it is the resolve cache key.
    const revoked = await this.prisma.apiKey.findFirst({
      where: {
        id: params.apiKeyId,
        orgId: params.organizationId,
        scope: { in: orgBoundApiKeyScopes },
      },
      select: { fastHashedSecretKey: true, scope: true },
    });
    if (!revoked) {
      throw new LangfuseNotFoundError("Gateway API key not found");
    }
    const deleted = await deleteApiKeyFromDb({
      prisma: this.prisma,
      id: params.apiKeyId,
      entityId: params.organizationId,
      scope: revoked.scope,
      redis: this.redis,
    });
    if (!deleted) {
      throw new InternalServerError("Failed to revoke gateway key");
    }
    if (revoked.fastHashedSecretKey) {
      await invalidateGatewayResolveCacheForApiKey(revoked.fastHashedSecretKey);
    }
    await auditLog(
      {
        session: params.session,
        resourceType: "apiKey",
        resourceId: params.apiKeyId,
        action: "delete",
        before: association,
      },
      this.prisma,
    );
  }
}

/**
 * Service-account keys survive membership changes, so only gateway managers may
 * issue them. Legacy public API auth ignores key roles and accepts a gateway key
 * as an organization admin key, so outside enforce they also need the right to
 * create organization API keys.
 */
export function gatewayApiKeyCreatorScopes(
  issuedAs: GatewayApiKeyIssuedAs,
): OrganizationScope[] {
  if (issuedAs === "user") return ["gateway:invoke"];
  return env.API_AUTH_MIGRATION === "enforce"
    ? ["gateway:manage"]
    : ["gateway:manage", "organization:CRUD_apiKeys"];
}

/** assertCreatorCanInvokeGateway share-locks the creator's membership so removal and demotion order after the key insert. */
async function assertCreatorCanInvokeGateway(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    issuedAs: GatewayApiKeyIssuedAs;
    session: OrgAuthedContext["session"];
  },
) {
  const [membership] = await tx.$queryRaw<{ role: Role }[]>`
    SELECT role FROM organization_memberships
    WHERE org_id = ${params.organizationId}
      AND user_id = ${params.session.user.id}
    FOR SHARE
  `;
  const allowed =
    membership !== undefined &&
    gatewayApiKeyCreatorScopes(params.issuedAs).every((scope) =>
      hasOrganizationAccess({ role: membership.role, scope }),
    );
  if (!allowed) {
    throw new ForbiddenError(
      params.issuedAs === "serviceAccount"
        ? "Your organization role cannot issue service-account gateway API keys"
        : "Only organization members who can invoke the gateway can create gateway API keys",
    );
  }
}
