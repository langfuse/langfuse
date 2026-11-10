import {
  Prisma,
  type GatewayConnectionStatus,
  type GatewayProvider,
  type PrismaClient,
} from "@langfuse/shared/src/db";

import { parseGatewayAllowedModels } from "@/src/features/ai-gateway/fns/parseGatewayAllowedModels";
import {
  type GatewayCustomModel,
  parseGatewayCustomModels,
} from "@/src/features/ai-gateway/fns/parseGatewayCustomModels";
import {
  type GatewayBedrockConfig,
  GatewayBedrockConfigSchema,
} from "@/src/features/ai-gateway/server/provider/bedrock";

const safeConnectionSelect = {
  id: true,
  organizationId: true,
  name: true,
  provider: true,
  displaySecret: true,
  createdById: true,
  status: true,
  allowedModels: true,
  customModels: true,
  config: true,
  baseURL: true,
  extraHeaderKeys: true,
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
    customModels: parseGatewayCustomModels(connection.customModels),
    config:
      GatewayBedrockConfigSchema.safeParse(connection.config).data ?? null,
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
        extraHeaders: true,
      },
    });
    return connection ? toSafeConnection(connection) : null;
  }

  async getEncryptedExtraHeaders(params: {
    organizationId: string;
    id: string;
  }) {
    const connection = await this.prisma.gatewayAiConnection.findFirst({
      where: params,
      select: { extraHeaders: true },
    });
    return connection?.extraHeaders ?? null;
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
    encryptedCredential: string;
    displaySecret: string;
    config: GatewayBedrockConfig | null;
    baseURL: string | null;
    extraHeaders: string | null;
    extraHeaderKeys: string[];
    createdById: string | null;
    status: GatewayConnectionStatus;
  }) {
    const connection = await this.prisma.gatewayAiConnection.create({
      data: { ...params, config: params.config ?? Prisma.DbNull },
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
    baseURL?: string | null;
    extraHeaders?: string | null;
    extraHeaderKeys?: string[];
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
    customModels?: GatewayCustomModel[];
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
        customModels: params.customModels,
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
