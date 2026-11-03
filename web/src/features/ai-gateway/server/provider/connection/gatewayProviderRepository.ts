import {
  Prisma,
  type GatewayConnectionStatus,
  type GatewayProvider,
  type PrismaClient,
} from "@langfuse/shared/src/db";

import { parseGatewayAllowedModels } from "@/src/features/ai-gateway/fns/parseGatewayAllowedModels";
import { parseGatewaySupportedRoutes } from "@/src/features/ai-gateway/fns/parseGatewaySupportedRoutes";

const safeConnectionSelect = {
  id: true,
  organizationId: true,
  name: true,
  provider: true,
  baseUrl: true,
  displaySecret: true,
  createdById: true,
  status: true,
  allowedModels: true,
  supportedRoutes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GatewayAiConnectionSelect;

type SafeConnectionRow = Prisma.GatewayAiConnectionGetPayload<{
  select: typeof safeConnectionSelect;
}>;

function toSafeConnection<T extends SafeConnectionRow>(connection: T) {
  return {
    ...connection,
    allowedModels: parseGatewayAllowedModels(connection.allowedModels),
    supportedRoutes: parseGatewaySupportedRoutes(connection.supportedRoutes),
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
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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

  async hasConnectionNamedIgnoringCase(params: {
    organizationId: string;
    name: string;
    excludeId?: string;
  }) {
    /** Postgres runs insensitive `equals` as an unescaped `ILIKE`, so `_` matches any character. */
    const candidates = await this.prisma.gatewayAiConnection.findMany({
      where: {
        organizationId: params.organizationId,
        // eslint-disable-next-line @repo/no-unescaped-prisma-like-pattern -- re-checked by exact lowercase match below
        name: { equals: params.name, mode: "insensitive" },
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      },
      select: { name: true },
    });
    const lowerName = params.name.toLowerCase();
    return candidates.some(
      (candidate) => candidate.name.toLowerCase() === lowerName,
    );
  }

  async createConnection(params: {
    organizationId: string;
    name: string;
    provider: GatewayProvider;
    baseUrl?: string | null;
    encryptedCredential: string;
    displaySecret: string;
    createdById: string | null;
    status: GatewayConnectionStatus;
    supportedRoutes?: string[] | null;
  }) {
    const { supportedRoutes, ...data } = params;
    const connection = await this.prisma.gatewayAiConnection.create({
      data: {
        ...data,
        ...(supportedRoutes === undefined
          ? {}
          : { supportedRoutes: supportedRoutes as Prisma.InputJsonValue }),
      },
      select: safeConnectionSelect,
    });
    return toSafeConnection(connection);
  }

  async updateConnection(params: {
    organizationId: string;
    id: string;
    name?: string;
    baseUrl?: string | null;
    encryptedCredential?: string;
    displaySecret?: string;
    status?: GatewayConnectionStatus;
    supportedRoutes?: string[] | null;
    /** When set, the update applies only if the row is unchanged since then. */
    expectedUpdatedAt?: Date;
  }) {
    const { organizationId, id, supportedRoutes, expectedUpdatedAt, ...data } =
      params;
    const connection = await this.prisma.gatewayAiConnection.update({
      where: {
        id,
        organizationId,
        ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}),
      },
      data: {
        ...data,
        ...(supportedRoutes === undefined
          ? {}
          : { supportedRoutes: supportedRoutes as Prisma.InputJsonValue }),
      },
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

  /** Runs `beforeDelete` and the delete under a row lock, so a row that
   * references the connection cannot be added in between. */
  async deleteConnection(
    params: { organizationId: string; id: string },
    beforeDelete: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM gateway_ai_connections
        WHERE id = ${params.id} AND organization_id = ${params.organizationId}
        FOR UPDATE
      `;
      await beforeDelete(tx);
      const connection = await tx.gatewayAiConnection.delete({
        where: { id: params.id, organizationId: params.organizationId },
        select: safeConnectionSelect,
      });
      return toSafeConnection(connection);
    });
  }

  /** Returns false when the connection changed since `expectedUpdatedAt`, leaving the newer state in place. */
  async updateConnectionStatus(params: {
    organizationId: string;
    id: string;
    status: GatewayConnectionStatus;
    expectedUpdatedAt: Date;
  }) {
    const result = await this.prisma.gatewayAiConnection.updateMany({
      where: {
        id: params.id,
        organizationId: params.organizationId,
        updatedAt: params.expectedUpdatedAt,
      },
      data: { status: params.status },
    });
    return result.count > 0;
  }

  async isConnectionUnchanged(params: {
    organizationId: string;
    id: string;
    updatedAt: Date;
  }) {
    const connection = await this.prisma.gatewayAiConnection.findFirst({
      where: params,
      select: { id: true },
    });
    return connection !== null;
  }
}
