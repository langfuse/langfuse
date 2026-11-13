import type { OrderByState } from "@langfuse/shared";
import { Prisma, type PrismaClient } from "@langfuse/shared/src/db";
import { escapeSqlLikePattern } from "@langfuse/shared/src/server";
import { orgBoundApiKeyScopes } from "@langfuse/shared/src/server/auth/apiKeys";

import type { GatewayMetadata } from "@/src/features/ai-gateway/server/provider/registry";

const GATEWAY_API_KEY_SELECT = {
  metadata: true,
  allowedModels: true,
  apiKey: {
    select: {
      id: true,
      publicKey: true,
      displaySecretKey: true,
      note: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
      createdByUserId: true,
      user: { select: { name: true, email: true, image: true } },
    },
  },
} as const;

export class GatewayApiKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Key model patterns name connections, so a rename would otherwise silently
   * drop access. Patterns that start with `previousName:` or `-previousName:`
   * (ignoring case, like the matcher) move to the new name; wildcard prefixes
   * stay as typed. One statement, so a concurrent rename of another connection
   * rewrites the committed array instead of overwriting it.
   */
  async renameConnectionInModelPatterns(
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

  async listGatewayApiKeys(params: {
    organizationId: string;
    ownerUserId?: string;
    searchQuery?: string;
    orderBy?: OrderByState;
    page: number;
    limit: number;
  }) {
    const where = {
      apiKey: {
        ...gatewayApiKeyWhere(params),
        ...(params.searchQuery && gatewayApiKeySearch(params.searchQuery)),
      },
    };
    const findPage = this.prisma.gatewayApiKeyAssociation.findMany({
      where,
      select: GATEWAY_API_KEY_SELECT,
      orderBy: [gatewayApiKeyOrderBy(params.orderBy), { apiKeyId: "asc" }],
      take: params.limit,
      skip: params.page * params.limit,
    });
    const [data, totalCount] = await Promise.all([
      findPage,
      this.prisma.gatewayApiKeyAssociation.count({ where }),
    ]);
    return { data, totalCount };
  }

  /** The subset of apiKeyIds that are gateway keys visible under the same scoping as the key list. */
  async filterVisibleGatewayApiKeyIds(params: {
    organizationId: string;
    ownerUserId?: string;
    apiKeyIds: string[];
  }) {
    if (params.apiKeyIds.length === 0) return [];
    const rows = await this.prisma.gatewayApiKeyAssociation.findMany({
      where: {
        apiKeyId: { in: params.apiKeyIds },
        apiKey: gatewayApiKeyWhere(params),
      },
      select: { apiKeyId: true },
    });
    return rows.map((row) => row.apiKeyId);
  }

  getGatewayApiKey(params: {
    organizationId: string;
    ownerUserId?: string;
    apiKeyId: string;
  }) {
    return this.prisma.gatewayApiKeyAssociation.findFirst({
      where: { apiKeyId: params.apiKeyId, apiKey: gatewayApiKeyWhere(params) },
      select: GATEWAY_API_KEY_SELECT,
    });
  }

  /**
   * Writes only while the key is still in scope and its patterns are the ones
   * the editor loaded, so a connection rename committed in between is not
   * overwritten. Returns whether a row was written.
   */
  async updateGatewayApiKey(params: {
    organizationId: string;
    ownerUserId?: string;
    apiKeyId: string;
    name: string;
    metadata: GatewayMetadata;
    allowedModels: string[] | null;
    previousAllowedModels: string[] | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.gatewayApiKeyAssociation.updateMany({
        where: {
          apiKeyId: params.apiKeyId,
          apiKey: gatewayApiKeyWhere(params),
          allowedModels: {
            equals: params.previousAllowedModels ?? Prisma.DbNull,
          },
        },
        data: {
          metadata: params.metadata,
          allowedModels: params.allowedModels ?? Prisma.DbNull,
        },
      });
      if (count === 0) return false;
      await tx.apiKey.update({
        where: { id: params.apiKeyId },
        data: { note: params.name },
      });
      return true;
    });
  }
}

/** gatewayApiKeyWhere scopes gateway keys to the organization and, when set, to the user the keys are bound to. */
function gatewayApiKeyWhere(params: {
  organizationId: string;
  ownerUserId?: string;
}) {
  return {
    orgId: params.organizationId,
    scope: { in: orgBoundApiKeyScopes },
    ...(params.ownerUserId !== undefined && { userId: params.ownerUserId }),
  } as const;
}

/** gatewayApiKeySearch matches the key name or the name or email of the user the key is bound to. */
function gatewayApiKeySearch(searchQuery: string) {
  const contains = {
    contains: escapeSqlLikePattern(searchQuery),
    mode: "insensitive",
  } as const;
  return {
    OR: [
      { note: contains },
      { user: { name: contains } },
      { user: { email: contains } },
    ],
  };
}

/**
 * gatewayApiKeyOrderBy maps a gateway keys table sort to the key list order; other columns keep the default oldest-first order.
 * A key without expiration never expires, so it sorts after every expiration date ascending and before them descending.
 */
function gatewayApiKeyOrderBy(
  orderBy: OrderByState | undefined,
): Prisma.GatewayApiKeyAssociationOrderByWithRelationInput {
  const sort = orderBy?.order === "DESC" ? "desc" : "asc";
  switch (orderBy?.column) {
    case "createdAt":
      return { apiKey: { createdAt: sort } };
    case "description":
      return { apiKey: { note: { sort, nulls: "last" } } };
    case "expiresAt":
      return {
        apiKey: {
          expiresAt: { sort, nulls: sort === "asc" ? "last" : "first" },
        },
      };
    default:
      return { apiKey: { createdAt: "asc" } };
  }
}
