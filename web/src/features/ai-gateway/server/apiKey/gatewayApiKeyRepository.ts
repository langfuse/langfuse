import type { PrismaClient } from "@langfuse/shared/src/db";

export class GatewayApiKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listGatewayApiKeys(params: {
    organizationId: string;
    page: number;
    limit: number;
  }) {
    const where = {
      apiKey: {
        orgId: params.organizationId,
        scope: "ORGANIZATION",
      },
    } as const;
    const findPage = this.prisma.gatewayApiKeyAssociation.findMany({
      where,
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
      take: params.limit,
      skip: params.page * params.limit,
    });
    const [data, totalCount] = await Promise.all([
      findPage,
      this.prisma.gatewayApiKeyAssociation.count({ where }),
    ]);
    return { data, totalCount };
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
