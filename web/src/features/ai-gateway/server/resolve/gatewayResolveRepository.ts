import type { GatewayProvider, PrismaClient } from "@langfuse/shared/src/db";

export class GatewayResolveRepository {
  constructor(private readonly prisma: PrismaClient) {}

  resolveContext(params: {
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
        apiKeyId: true,
        metadata: true,
        apiKey: {
          select: {
            orgId: true,
            organization: {
              select: {
                gatewayConfig: {
                  select: {
                    defaultIngestionProjectId: true,
                    ingestionMode: true,
                    defaultIngestionProject: {
                      select: { id: true, orgId: true, deletedAt: true },
                    },
                  },
                },
                gatewayAiConnections: {
                  where: {
                    provider: { in: params.providers },
                    status: "ENABLED",
                  },
                  orderBy: { routingPriority: "asc" },
                  take: 1,
                  select: {
                    id: true,
                    provider: true,
                    encryptedCredential: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }
}
