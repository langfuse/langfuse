import {
  ForbiddenError,
  InternalServerError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import type { Prisma, PrismaClient, Role } from "@langfuse/shared/src/db";
import {
  createApiKey,
  deleteApiKeyFromDb,
} from "@langfuse/shared/src/server/auth/apiKeys";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import type { Cluster, Redis } from "ioredis";

import { auditLog } from "@/src/features/audit-logs/server";
import type { GatewayMetadata } from "@/src/features/ai-gateway/server/provider";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { invalidateGatewayResolveCacheForApiKey } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { GatewayApiKeyRepository } from "./gatewayApiKeyRepository";

export class GatewayApiKeyService {
  private readonly repository: GatewayApiKeyRepository;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis?: Redis | Cluster | null,
  ) {
    this.repository = new GatewayApiKeyRepository(prisma);
  }

  list(params: { organizationId: string; page: number; limit: number }) {
    return this.repository.listGatewayApiKeys(params);
  }

  async create(params: {
    organizationId: string;
    name?: string;
    metadata: GatewayMetadata;
    expiresAt?: Date | null;
    session: OrgAuthedContext["session"];
  }) {
    const key = await this.prisma.$transaction(async (tx) => {
      await assertCreatorCanInvokeGateway(tx, params);
      const key = await createApiKey(tx, {
        tenant: OrganizationId(params.organizationId),
        scope: UserId(params.session.user.id),
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
    });
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
        },
      },
      this.prisma,
    );
    return key;
  }

  async revoke(params: {
    organizationId: string;
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

/** assertCreatorCanInvokeGateway share-locks the creator's membership so removal and demotion order after the key insert. */
async function assertCreatorCanInvokeGateway(
  tx: Prisma.TransactionClient,
  params: { organizationId: string; session: OrgAuthedContext["session"] },
) {
  const [membership] = await tx.$queryRaw<{ role: Role }[]>`
    SELECT role FROM organization_memberships
    WHERE org_id = ${params.organizationId}
      AND user_id = ${params.session.user.id}
    FOR SHARE
  `;
  if (params.session.user.admin) return;
  if (
    !membership ||
    !hasOrganizationAccess({ role: membership.role, scope: "gateway:invoke" })
  ) {
    throw new ForbiddenError(
      "Only organization members who can invoke the gateway can create gateway API keys",
    );
  }
}
