import {
  ForbiddenError,
  InternalServerError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { Prisma, type PrismaClient, type Role } from "@langfuse/shared/src/db";
import {
  createApiKey,
  deleteApiKeyFromDb,
} from "@langfuse/shared/src/server/auth/apiKeys";
import {
  OrganizationId,
  type OrganizationScope,
  SystemRoleId,
  UserId,
} from "@langfuse/shared/rbac";
import type { Cluster, Redis } from "ioredis";

import { env } from "@/src/env.mjs";
import { auditLog } from "@/src/features/audit-logs/server";
import type { GatewayMetadata } from "@/src/features/ai-gateway/server/provider";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { invalidateGatewayResolveCacheForApiKey } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { GatewayApiKeyRepository } from "./gatewayApiKeyRepository";

type GatewayApiKeyIssuedAs = "user" | "serviceAccount";

export class GatewayApiKeyService {
  private readonly repository: GatewayApiKeyRepository;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis?: Redis | Cluster | null,
  ) {
    this.repository = new GatewayApiKeyRepository(prisma);
  }

  /** Without ownerUserId, lists every gateway key in the organization. */
  list(params: {
    organizationId: string;
    ownerUserId?: string;
    searchQuery?: string;
    page: number;
    limit: number;
  }) {
    return this.repository.listGatewayApiKeys(params);
  }

  async create(params: {
    organizationId: string;
    name?: string;
    metadata: GatewayMetadata;
    expiresAt?: Date | null;
    /** `user` keys are revoked with the creator's gateway access; `serviceAccount` keys belong to the organization. */
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
        },
      },
      this.prisma,
    );
    return key;
  }

  /** With ownerUserId, another user's key is reported as not found. */
  async revoke(params: {
    organizationId: string;
    ownerUserId?: string;
    apiKeyId: string;
    session: OrgAuthedContext["session"];
  }): Promise<void> {
    const association = await this.repository.getGatewayApiKey(params);
    if (!association) {
      throw new LangfuseNotFoundError("Gateway API key not found");
    }
    // Read the hash before the row is gone; it is the resolve cache key.
    const revoked = await this.prisma.apiKey.findFirst({
      where: {
        id: params.apiKeyId,
        orgId: params.organizationId,
        scope: "ORGANIZATION",
      },
      select: { fastHashedSecretKey: true },
    });
    const deleted = await deleteApiKeyFromDb({
      prisma: this.prisma,
      id: params.apiKeyId,
      entityId: params.organizationId,
      scope: "ORGANIZATION",
      redis: this.redis,
    });
    if (!deleted) {
      throw new InternalServerError("Failed to revoke gateway API key");
    }
    if (revoked?.fastHashedSecretKey) {
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
  if (params.session.user.admin) return;
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
