import {
  Prisma,
  type GatewayConnectionStatus,
  type GatewayProvider,
  type PrismaClient,
} from "@langfuse/shared/src/db";

import { normalizeGatewayAllowedModels } from "@/src/features/ai-gateway/fns/normalizeGatewayAllowedModels";

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
  allowedModels: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GatewayAiConnectionSelect;

type SafeConnectionRow = Prisma.GatewayAiConnectionGetPayload<{
  select: typeof safeConnectionSelect;
}>;

function toSafeConnection<T extends SafeConnectionRow>(connection: T) {
  return {
    ...connection,
    allowedModels: normalizeGatewayAllowedModels(connection.allowedModels),
  };
}

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
      data: data.map(toSafeConnection),
      nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null,
    };
  }

  async getSafeConnection(params: { organizationId: string; id: string }) {
    const connection = await this.prisma.gatewayAiConnection.findFirst({
      where: params,
      select: safeConnectionSelect,
    });
    return connection ? toSafeConnection(connection) : null;
  }

  async getConnectionWithCredential(params: {
    organizationId: string;
    id: string;
  }) {
    const connection = await this.prisma.gatewayAiConnection.findFirst({
      where: params,
      select: {
        ...safeConnectionSelect,
        encryptedCredential: true,
      },
    });
    return connection ? toSafeConnection(connection) : null;
  }

  async createConnection(params: {
    organizationId: string;
    name: string;
    provider: GatewayProvider;
    encryptedCredential: string;
    displaySecret: string;
    createdById: string | null;
    status: GatewayConnectionStatus;
  }) {
    const connection = await this.prisma.$transaction(async (tx) => {
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
    return toSafeConnection(connection);
  }

  async updateConnection(params: {
    organizationId: string;
    id: string;
    name?: string;
    encryptedCredential?: string;
    displaySecret?: string;
    status?: GatewayConnectionStatus;
  }) {
    const { organizationId, id, ...data } = params;
    const connection = await this.prisma.gatewayAiConnection.update({
      where: { id, organizationId },
      data,
      select: safeConnectionSelect,
    });
    return toSafeConnection(connection);
  }

  async updateAllowedModels(params: {
    organizationId: string;
    id: string;
    allowedModels: string[] | null;
    expectedUpdatedAt: Date;
  }) {
    const result = await this.prisma.gatewayAiConnection.updateMany({
      where: {
        id: params.id,
        organizationId: params.organizationId,
        updatedAt: params.expectedUpdatedAt,
      },
      data: {
        allowedModels:
          params.allowedModels === null ? Prisma.DbNull : params.allowedModels,
      },
    });
    if (result.count === 0) return null;
    return this.getSafeConnection({
      organizationId: params.organizationId,
      id: params.id,
    });
  }

  /**
   * Deletes a connection and closes the gap it leaves in the routing order in
   * one transaction. Splitting the two lets a concurrent delete compact
   * against rows that no longer exist, which abandons the gap.
   */
  async deleteConnection(params: { organizationId: string; id: string }) {
    const connection = await this.prisma.$transaction(async (tx) => {
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
    return toSafeConnection(connection);
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

  async updateConnectionStatus(params: {
    organizationId: string;
    id: string;
    status: GatewayConnectionStatus;
  }) {
    const connection = await this.prisma.gatewayAiConnection.update({
      where: { id: params.id, organizationId: params.organizationId },
      data: { status: params.status },
      select: safeConnectionSelect,
    });
    return toSafeConnection(connection);
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
