import { InternalServerError, LangfuseNotFoundError } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  deleteApiKeyFromDb,
} from "@langfuse/shared/src/server/auth/apiKeys";
import type { Cluster, Redis } from "ioredis";

import { auditLog } from "@/src/features/audit-logs/server";
import type { GatewayAuditActor } from "./audit";
import type { GatewayMetadata } from "./provider";
import { GatewayRepository } from "./repository";

export class GatewayApiKeyService {
  private readonly repository: GatewayRepository;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis?: Redis | Cluster | null,
  ) {
    this.repository = new GatewayRepository(prisma);
  }

  list(params: { organizationId: string; cursor?: string; limit: number }) {
    return this.repository.listGatewayApiKeys(params);
  }

  async create(params: {
    organizationId: string;
    note?: string;
    metadata: GatewayMetadata;
    actor: GatewayAuditActor;
  }) {
    const key = await this.prisma.$transaction(async (tx) => {
      // TODO: Narrow this virtual key to the `gateway:invoke` permission once granular API-key scopes are available.
      const key = await createAndAddApiKeysToDb({
        prisma: tx,
        entityId: params.organizationId,
        scope: "ORGANIZATION",
        note: params.note,
        createdByUserId: params.actor.userId,
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
        userId: params.actor.userId,
        orgId: params.organizationId,
        orgRole: params.actor.orgRole,
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
    actor: GatewayAuditActor;
  }): Promise<void> {
    const association = await this.repository.getGatewayApiKey(params);
    if (!association) {
      throw new LangfuseNotFoundError("Gateway API key not found");
    }
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
    await auditLog(
      {
        userId: params.actor.userId,
        orgId: params.organizationId,
        orgRole: params.actor.orgRole,
        resourceType: "gatewayApiKey",
        resourceId: params.apiKeyId,
        action: "delete",
        before: association,
      },
      this.prisma,
    );
  }
}
