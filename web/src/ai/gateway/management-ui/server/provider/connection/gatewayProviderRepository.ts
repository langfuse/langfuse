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

  /**
   * Deletes a connection and closes the gap it leaves in the routing order in
   * one transaction. Splitting the two lets a concurrent delete compact
   * against rows that no longer exist, which abandons the gap.
   */
  deleteConnection(params: { organizationId: string; id: string }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockOrganization(tx, params.organizationId);
      const deleted = await tx.gatewayAiConnection.delete({
        where: { id: params.id, organizationId: params.organizationId },
        select: safeConnectionSelect,
      });
      const remaining = await tx.gatewayAiConnection.findMany({
        where: { organizationId: params.organizationId },
        select: { id: true },
        orderBy: [{ routingPriority: "asc" }, { id: "asc" }],
      });
      await this.writePriorities(tx, {
        organizationId: params.organizationId,
        connectionIds: remaining.map((connection) => connection.id),
      });
      return deleted;
    });
  }

  async reorderConnections(params: {
    organizationId: string;
    connectionIds: string[];
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Rows are locked in caller-supplied order, so two concurrent reorders
      // of one organization deadlock unless they serialize on the same key
      // createConnection uses.
      await this.lockOrganization(tx, params.organizationId);
      await this.writePriorities(tx, params);
    });
  }

  private lockOrganization(tx: DatabaseClient, organizationId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
  }

  /**
   * Assigns priorities 0..n in list order. Written in two passes through
   * negative values because (organization_id, routing_priority) uniqueness is
   * enforced by an index, which Postgres cannot defer to commit time.
   */
  private async writePriorities(
    tx: DatabaseClient,
    params: { organizationId: string; connectionIds: string[] },
  ) {
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
