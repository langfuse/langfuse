import type { GatewayProvider, PrismaClient } from "@langfuse/shared/src/db";

export class GatewayModelsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  getConnections(params: {
    organizationId: string;
    providers: GatewayProvider[];
  }) {
    return this.prisma.gatewayAiConnection.findMany({
      where: {
        organizationId: params.organizationId,
        provider: { in: params.providers },
        status: "ENABLED",
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, allowedModels: true },
    });
  }
}
