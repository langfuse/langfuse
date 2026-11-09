import type { OrderByState } from "@langfuse/shared";
import type { Prisma, PrismaClient } from "@langfuse/shared/src/db";
import { escapeSqlLikePattern } from "@langfuse/shared/src/server";

const GATEWAY_API_KEY_SELECT = {
  metadata: true,
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
}

/** gatewayApiKeyWhere scopes gateway keys to the organization and, when set, to the user the keys are bound to. */
function gatewayApiKeyWhere(params: {
  organizationId: string;
  ownerUserId?: string;
}) {
  return {
    orgId: params.organizationId,
    scope: "ORGANIZATION",
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
