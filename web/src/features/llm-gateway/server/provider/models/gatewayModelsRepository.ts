import type { GatewayProvider, PrismaClient } from "@langfuse/shared/src/db";

export class GatewayModelsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  getContext(params: {
    fastHashedSecretKey: string;
    providers: GatewayProvider[];
  }) {
    const now = new Date();
    return this.prisma.gatewayApiKeyAssociation.findFirst({
      relationLoadStrategy: "join",
      where: {
        apiKey: {
          fastHashedSecretKey: params.fastHashedSecretKey,
          scope: "ORGANIZATION",
          orgId: { not: null },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
      select: {
        apiKey: {
          select: {
            orgId: true,
            organization: {
              select: {
                gatewayAiConnections: {
                  where: {
                    provider: { in: params.providers },
                    status: "ENABLED",
                  },
                  orderBy: [{ routingPriority: "asc" }, { id: "asc" }],
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });
  }
}
