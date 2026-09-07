import type {
  GatewayConnectionStatus,
  GatewayProvider,
  Prisma,
  PrismaClient,
} from "@langfuse/shared/src/db";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const safeConnectionSelect = {
  id: true,
  organizationId: true,
  name: true,
  provider: true,
  displaySecret: true,
  createdById: true,
  routingPriority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GatewayAiConnectionSelect;

export class GatewayProviderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listConnections(params: {
    organizationId: string;
    cursor?: string;
    limit: number;
    status?: GatewayConnectionStatus;
  }) {
    const rows = await this.prisma.gatewayAiConnection.findMany({
      where: {
        organizationId: params.organizationId,
        status: params.status,
      },
      select: safeConnectionSelect,
      orderBy: [{ routingPriority: "asc" }, { id: "asc" }],
      take: params.limit + 1,
      ...(params.cursor
        ? { cursor: { id: params.cursor }, skip: 1 }
        : undefined),
    });
    const hasMore = rows.length > params.limit;
    const data = hasMore ? rows.slice(0, params.limit) : rows;
    return {
      data,
      nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null,
    };
  }

  getSafeConnection(params: { organizationId: string; id: string }) {
    return this.prisma.gatewayAiConnection.findFirst({
      where: params,
      select: safeConnectionSelect,
    });
  }

  getConnectionWithCredential(params: { organizationId: string; id: string }) {
    return this.prisma.gatewayAiConnection.findFirst({
      where: params,
      select: {
        ...safeConnectionSelect,
        encryptedCredential: true,
      },
    });
  }

  createConnection(params: {
    organizationId: string;
    name: string;
    provider: GatewayProvider;
    encryptedCredential: string;
    displaySecret: string;
    createdById: string | null;
    status: GatewayConnectionStatus;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.organizationId}))`;
      const aggregate = await tx.gatewayAiConnection.aggregate({
        where: { organizationId: params.organizationId },
        _max: { routingPriority: true },
      });
      return tx.gatewayAiConnection.create({
        data: {
          ...params,
          routingPriority: (aggregate._max.routingPriority ?? -1) + 1,
        },
        select: safeConnectionSelect,
      });
    });
  }

  updateConnection(params: {
    organizationId: string;
    id: string;
    name?: string;
    encryptedCredential?: string;
    displaySecret?: string;
    status?: GatewayConnectionStatus;
  }) {
    const { organizationId, id, ...data } = params;
    return this.prisma.gatewayAiConnection.update({
      where: { id, organizationId },
      data,
      select: safeConnectionSelect,
    });
  }

  deleteConnection(params: { organizationId: string; id: string }) {
    return this.prisma.gatewayAiConnection.delete({
      where: params,
      select: safeConnectionSelect,
    });
  }

  async reorderConnections(params: {
    organizationId: string;
    connectionIds: string[];
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of params.connectionIds.entries()) {
        await this.updatePriority(tx, {
          organizationId: params.organizationId,
          id,
          routingPriority: -(index + 1),
        });
      }
      for (const [index, id] of params.connectionIds.entries()) {
        await this.updatePriority(tx, {
          organizationId: params.organizationId,
          id,
          routingPriority: index,
        });
      }
    });
  }

  updateConnectionStatus(params: {
    organizationId: string;
    id: string;
    status: GatewayConnectionStatus;
  }) {
    return this.prisma.gatewayAiConnection.update({
      where: { id: params.id, organizationId: params.organizationId },
      data: { status: params.status },
      select: safeConnectionSelect,
    });
  }

  selectConnectionWithCredential(params: {
    organizationId: string;
    providers: GatewayProvider[];
  }) {
    return this.prisma.gatewayAiConnection.findFirst({
      where: {
        organizationId: params.organizationId,
        provider: { in: params.providers },
        status: "ENABLED",
      },
      orderBy: { routingPriority: "asc" },
      select: {
        id: true,
        provider: true,
        encryptedCredential: true,
      },
    });
  }

  private updatePriority(
    tx: DatabaseClient,
    params: {
      organizationId: string;
      id: string;
      routingPriority: number;
    },
  ) {
    return tx.gatewayAiConnection.update({
      where: { id: params.id, organizationId: params.organizationId },
      data: { routingPriority: params.routingPriority },
    });
  }
}
