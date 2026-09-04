import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  deleteApiKeyFromDb,
} from "@langfuse/shared/src/server/auth/apiKeys";
import type { Cluster, Redis } from "ioredis";

import { assertFlatGatewayMetadata } from "./providerRegistry";
import { GatewayRepository } from "./repository";

export class GatewayApiKeyService {
  private readonly repository: GatewayRepository;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis?: Redis | Cluster | null,
  ) {
    this.repository = new GatewayRepository(prisma);
  }

  list(organizationId: string) {
    return this.repository.listGatewayApiKeys(organizationId);
  }

  async create(params: {
    organizationId: string;
    note?: string;
    metadata: unknown;
    createdByUserId: string;
  }) {
    const metadata = assertFlatGatewayMetadata(params.metadata);
    return this.prisma.$transaction(async (tx) => {
      const key = await createAndAddApiKeysToDb({
        prisma: tx,
        entityId: params.organizationId,
        scope: "ORGANIZATION",
        note: params.note,
        createdByUserId: params.createdByUserId,
      });
      await tx.gatewayApiKeyAssociation.create({
        data: {
          apiKeyId: key.id,
          metadata,
        },
      });
      return key;
    });
  }

  async revoke(params: {
    organizationId: string;
    apiKeyId: string;
  }): Promise<boolean> {
    const association = await this.repository.getGatewayApiKey(params);
    if (!association) return false;
    return deleteApiKeyFromDb({
      prisma: this.prisma,
      id: params.apiKeyId,
      entityId: params.organizationId,
      scope: "ORGANIZATION",
      redis: this.redis,
    });
  }
}
