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
    /** Set with `name` to carry key model patterns over to the new name. */
    previousName?: string;
  }) {
    const { organizationId, id, previousName, ...data } = params;
    return this.prisma.$transaction(async (tx) => {
      // Matching the previous name makes a concurrent rename fail with P2025 instead of leaving key patterns on a stale name.
      const connection = await tx.gatewayAiConnection.update({
        where: {
          id,
          organizationId,
          ...(previousName !== undefined && { name: previousName }),
        },
        data,
        select: safeConnectionSelect,
      });
      if (data.name !== undefined && previousName !== undefined) {
        await renameConnectionInGatewayKeyModelPatterns(tx, {
          organizationId,
          previousName,
          name: data.name,
        });
      }
      return toSafeConnection(connection);
    });
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

/**
 * Key model patterns name connections, so a rename would otherwise silently
 * drop access. Patterns that start with `previousName:` or `-previousName:`
 * (ignoring case, like the matcher) move to the new name; wildcard prefixes
 * stay as typed. One statement, so a concurrent rename of another connection
 * rewrites the committed array instead of overwriting it.
 */
async function renameConnectionInGatewayKeyModelPatterns(
  tx: Prisma.TransactionClient,
  params: { organizationId: string; previousName: string; name: string },
) {
  const include = `${params.previousName}:`;
  const exclude = `-${include}`;
  await tx.$executeRaw`
    UPDATE gateway_api_key_associations AS a
    SET allowed_models = (
      SELECT jsonb_agg(
        CASE
          WHEN lower(left(e.pattern, char_length(${include}::text))) = lower(${include}::text)
            THEN ${`${params.name}:`}::text || substr(e.pattern, char_length(${include}::text) + 1)
          WHEN lower(left(e.pattern, char_length(${exclude}::text))) = lower(${exclude}::text)
            THEN ${`-${params.name}:`}::text || substr(e.pattern, char_length(${exclude}::text) + 1)
          ELSE e.pattern
        END
        ORDER BY e.position
      )
      FROM jsonb_array_elements_text(a.allowed_models) WITH ORDINALITY AS e(pattern, position)
    )
    FROM api_keys AS k
    WHERE k.id = a.api_key_id
      AND k.organization_id = ${params.organizationId}
      AND jsonb_typeof(a.allowed_models) = 'array'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(a.allowed_models) AS p(pattern)
        WHERE lower(left(p.pattern, char_length(${include}::text))) = lower(${include}::text)
          OR lower(left(p.pattern, char_length(${exclude}::text))) = lower(${exclude}::text)
      )
  `;
}
