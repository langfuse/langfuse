import {
  Prisma,
  type GatewayConnectionStatus,
  type GatewayProvider,
  type PrismaClient,
} from "@langfuse/shared/src/db";

import { parseGatewayAllowedModels } from "@/src/features/ai-gateway/fns/parseGatewayAllowedModels";

const safeConnectionSelect = {
  id: true,
  organizationId: true,
  name: true,
  provider: true,
  displaySecret: true,
  createdById: true,
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
    allowedModels: parseGatewayAllowedModels(connection.allowedModels),
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
    encryptedCredential: string;
    displaySecret: string;
    createdById: string | null;
    status: GatewayConnectionStatus;
  }) {
    const connection = await this.prisma.gatewayAiConnection.create({
      data: params,
      select: safeConnectionSelect,
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

  async deleteConnection(params: { organizationId: string; id: string }) {
    const connection = await this.prisma.gatewayAiConnection.delete({
      where: { id: params.id, organizationId: params.organizationId },
      select: safeConnectionSelect,
    });
    return toSafeConnection(connection);
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
}
