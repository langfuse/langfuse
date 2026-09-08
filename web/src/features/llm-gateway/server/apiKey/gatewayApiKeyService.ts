import { InternalServerError, LangfuseNotFoundError } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  deleteApiKeyFromDb,
} from "@langfuse/shared/src/server/auth/apiKeys";
import type { Cluster, Redis } from "ioredis";

import { auditLog } from "@/src/features/audit-logs/server";
import type { GatewayMetadata } from "@/src/features/llm-gateway/server/provider";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { invalidateGatewayResolveCacheForApiKey } from "@/src/features/llm-gateway/server/resolve/gatewayResolveCache";
import { GatewayApiKeyRepository } from "./gatewayApiKeyRepository";

export class GatewayApiKeyService {
  private readonly repository: GatewayApiKeyRepository;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis?: Redis | Cluster | null,
  ) {
    this.repository = new GatewayApiKeyRepository(prisma);
  }

  list(params: { organizationId: string; cursor?: string; limit: number }) {
    return this.repository.listGatewayApiKeys(params);
  }

  async create(params: {
    organizationId: string;
    note?: string;
    metadata: GatewayMetadata;
    session: OrgAuthedContext["session"];
  }) {
    const key = await this.prisma.$transaction(async (tx) => {
      // TODO: Narrow this virtual key to the `gateway:invoke` permission once granular API-key scopes are available.
      const key = await createAndAddApiKeysToDb({
        prisma: tx,
        entityId: params.organizationId,
        scope: "ORGANIZATION",
        note: params.note,
        createdByUserId: params.session.user.id,
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
        resourceType: "gatewayApiKey",
        resourceId: key.id,
        action: "create",
        after: {
          id: key.id,
          publicKey: key.publicKey,
          displaySecretKey: key.displaySecretKey,
          note: key.note,
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
        resourceType: "gatewayApiKey",
        resourceId: params.apiKeyId,
        action: "delete",
        before: association,
      },
      this.prisma,
    );
  }
}
