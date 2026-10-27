import type { GatewayProvider, PrismaClient } from "@langfuse/shared/src/db";

export class GatewayResolveRepository {
  constructor(private readonly prisma: PrismaClient) {}

  resolveContext(params: {
    fastHashedSecretKey: string;
    providers: GatewayProvider[];
  }) {
    const now = new Date();
    return this.prisma.apiKey.findFirst({
      relationLoadStrategy: "join",
      where: {
        fastHashedSecretKey: params.fastHashedSecretKey,
        scope: "ORGANIZATION",
        orgId: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        orgId: true,
        userId: true,
        expiresAt: true,
        note: true,
        user: { select: { name: true } },
        gatewayAssociation: { select: { metadata: true } },
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
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                name: true,
                provider: true,
                encryptedCredential: true,
                allowedModels: true,
              },
            },
          },
        },
      },
    });
  }
}
