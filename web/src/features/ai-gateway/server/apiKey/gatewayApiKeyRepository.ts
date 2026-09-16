import type { PrismaClient } from "@langfuse/shared/src/db";

export class GatewayApiKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listGatewayApiKeys(params: {
    organizationId: string;
    cursor?: string;
    limit: number;
  }) {
    const rows = await this.prisma.gatewayApiKeyAssociation.findMany({
      where: {
        apiKey: {
          orgId: params.organizationId,
          scope: "ORGANIZATION",
        },
      },
      select: {
        metadata: true,
        apiKey: {
          select: {
            id: true,
            publicKey: true,
            displaySecretKey: true,
            note: true,
            createdAt: true,
            expiresAt: true,
            lastUsedAt: true,
            createdByUserId: true,
          },
        },
      },
      orderBy: [{ apiKey: { createdAt: "asc" } }, { apiKeyId: "asc" }],
      take: params.limit + 1,
      ...(params.cursor
        ? { cursor: { apiKeyId: params.cursor }, skip: 1 }
        : undefined),
    });
    const hasMore = rows.length > params.limit;
    const data = hasMore ? rows.slice(0, params.limit) : rows;
    return {
      data,
      nextCursor: hasMore ? (data.at(-1)?.apiKey.id ?? null) : null,
    };
  }

  getGatewayApiKey(params: { organizationId: string; apiKeyId: string }) {
    return this.prisma.gatewayApiKeyAssociation.findFirst({
      where: {
        apiKeyId: params.apiKeyId,
        apiKey: {
          orgId: params.organizationId,
          scope: "ORGANIZATION",
        },
      },
      select: {
        metadata: true,
        apiKey: {
          select: {
            id: true,
            publicKey: true,
            displaySecretKey: true,
            note: true,
            createdAt: true,
            expiresAt: true,
            lastUsedAt: true,
            createdByUserId: true,
          },
        },
      },
    });
  }
}
