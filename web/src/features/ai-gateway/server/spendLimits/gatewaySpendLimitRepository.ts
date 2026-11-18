import type {
  GatewaySpendLimitInterval,
  Prisma,
  PrismaClient,
  Role,
} from "@langfuse/shared/src/db";
import { escapeSqlLikePattern } from "@langfuse/shared/src/server";
import {
  gatewayApiKeySearch,
  gatewayApiKeyWhere,
} from "@/src/features/ai-gateway/server/apiKey/gatewayApiKeyRepository";
import { GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES } from "./gatewayDefaultSpendLimits";
import {
  type GatewaySpendLimitScope,
  toScopeColumns,
} from "./gatewaySpendLimitScope";

const GATEWAY_SPEND_LIMIT_SELECT = {
  id: true,
  scope: true,
  apiKeyId: true,
  userId: true,
  interval: true,
  limitUsd: true,
  countingStartedAt: true,
  ownerUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const BUDGET_USER_SELECT = {
  select: { id: true, name: true, email: true, image: true },
} as const;

export type GatewaySpendLimitRecord = Prisma.GatewaySpendLimitGetPayload<{
  select: typeof GATEWAY_SPEND_LIMIT_SELECT;
}>;

export class GatewaySpendLimitRepository {
  constructor(
    private readonly prisma: PrismaClient | Prisma.TransactionClient,
  ) {}

  async hasAny(organizationId: string) {
    const limit = await this.prisma.gatewaySpendLimit.findFirst({
      where: { organizationId },
      select: { id: true },
    });
    return limit !== null;
  }

  list(params: { organizationId: string; scope: GatewaySpendLimitScope }) {
    return this.prisma.gatewaySpendLimit.findMany({
      where: {
        organizationId: params.organizationId,
        ...toScopeColumns(params.scope),
      },
      select: GATEWAY_SPEND_LIMIT_SELECT,
      orderBy: { createdAt: "asc" },
    });
  }

  /** The organization's default limit for keys or users without one of their own. */
  findDefault(params: {
    organizationId: string;
    scope: GatewaySpendLimitScope["type"];
  }) {
    return this.prisma.gatewaySpendLimit.findFirst({
      where: {
        organizationId: params.organizationId,
        scope: GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES[params.scope],
      },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  listDefaults(organizationId: string) {
    return this.prisma.gatewaySpendLimit.findMany({
      where: {
        organizationId,
        scope: { in: Object.values(GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES) },
      },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  /**
   * One page of the organization's key or user limits, by key or user name,
   * with what they apply to. Search matches the key name and the name or
   * email of its user, or the user's name or email; with ownerUserId, only
   * that user's keys or own limit are listed. Without a page, all of them.
   */
  async listPage(params: {
    organizationId: string;
    scope: "API_KEY" | "USER";
    ownerUserId?: string;
    searchQuery?: string;
    page?: { page: number; limit: number };
  }) {
    const contains = params.searchQuery
      ? ({
          contains: escapeSqlLikePattern(params.searchQuery),
          mode: "insensitive",
        } as const)
      : undefined;
    const where: Prisma.GatewaySpendLimitWhereInput =
      params.scope === "API_KEY"
        ? {
            organizationId: params.organizationId,
            scope: "API_KEY",
            apiKey: {
              ...(params.ownerUserId !== undefined && {
                userId: params.ownerUserId,
              }),
              ...(contains && {
                OR: [
                  { note: contains },
                  { user: { name: contains } },
                  { user: { email: contains } },
                ],
              }),
            },
          }
        : {
            organizationId: params.organizationId,
            scope: "USER",
            ...(params.ownerUserId !== undefined && {
              userId: params.ownerUserId,
            }),
            ...(contains && {
              user: { OR: [{ name: contains }, { email: contains }] },
            }),
          };
    const [rows, totalCount] = await Promise.all([
      this.prisma.gatewaySpendLimit.findMany({
        where,
        select: {
          ...GATEWAY_SPEND_LIMIT_SELECT,
          apiKey: {
            select: {
              note: true,
              displaySecretKey: true,
              user: BUDGET_USER_SELECT,
            },
          },
          user: BUDGET_USER_SELECT,
        },
        orderBy: [
          params.scope === "API_KEY"
            ? { apiKey: { note: { sort: "asc", nulls: "last" } } }
            : { user: { name: { sort: "asc", nulls: "last" } } },
          { createdAt: "asc" },
        ],
        ...(params.page && {
          skip: params.page.page * params.page.limit,
          take: params.page.limit,
        }),
      }),
      this.prisma.gatewaySpendLimit.count({ where }),
    ]);
    return { rows, totalCount };
  }

  /**
   * One page of the organization's gateway keys, or of its members with one
   * of `memberRoles`, each with its spend limit if it has one. Search and
   * ownerUserId work as in `listPage`; `withoutLimitOnly` leaves out those
   * with a limit of their own. Without a page, all of them.
   */
  async listSubjectsPage(params: {
    organizationId: string;
    scope: "API_KEY" | "USER";
    memberRoles: Role[];
    ownerUserId?: string;
    searchQuery?: string;
    withoutLimitOnly: boolean;
    page?: { page: number; limit: number };
  }) {
    const paging = params.page && {
      skip: params.page.page * params.page.limit,
      take: params.page.limit,
    };
    const limitWhere = {
      organizationId: params.organizationId,
      scope: params.scope,
    } as const;

    if (params.scope === "API_KEY") {
      const where: Prisma.ApiKeyWhereInput = {
        ...gatewayApiKeyWhere(params),
        gatewayAssociation: { isNot: null },
        ...(params.searchQuery && gatewayApiKeySearch(params.searchQuery)),
        ...(params.withoutLimitOnly && { gatewaySpendLimits: { none: {} } }),
      };
      const [keys, totalCount] = await Promise.all([
        this.prisma.apiKey.findMany({
          where,
          select: {
            id: true,
            note: true,
            displaySecretKey: true,
            user: BUDGET_USER_SELECT,
            gatewaySpendLimits: {
              where: limitWhere,
              select: GATEWAY_SPEND_LIMIT_SELECT,
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
          orderBy: [{ note: { sort: "asc", nulls: "last" } }, { id: "asc" }],
          ...paging,
        }),
        this.prisma.apiKey.count({ where }),
      ]);
      return {
        totalCount,
        rows: keys.map((key) => ({
          subjectId: key.id,
          name: key.note ?? key.displaySecretKey,
          user: key.user,
          limit: key.gatewaySpendLimits[0] ?? null,
        })),
      };
    }

    const search = params.searchQuery
      ? ({
          contains: escapeSqlLikePattern(params.searchQuery),
          mode: "insensitive",
        } as const)
      : undefined;
    const where: Prisma.OrganizationMembershipWhereInput = {
      orgId: params.organizationId,
      role: { in: params.memberRoles },
      ...(params.ownerUserId !== undefined && { userId: params.ownerUserId }),
      user: {
        email: { not: null },
        ...(search && { OR: [{ name: search }, { email: search }] }),
        ...(params.withoutLimitOnly && {
          gatewaySpendLimits: { none: limitWhere },
        }),
      },
    };
    const [memberships, totalCount] = await Promise.all([
      this.prisma.organizationMembership.findMany({
        where,
        select: {
          user: {
            select: {
              ...BUDGET_USER_SELECT.select,
              gatewaySpendLimits: {
                where: limitWhere,
                select: GATEWAY_SPEND_LIMIT_SELECT,
                orderBy: { createdAt: "asc" },
                take: 1,
              },
            },
          },
        },
        orderBy: [
          { user: { name: { sort: "asc", nulls: "last" } } },
          { userId: "asc" },
        ],
        ...paging,
      }),
      this.prisma.organizationMembership.count({ where }),
    ]);
    return {
      totalCount,
      rows: memberships.map(({ user: { gatewaySpendLimits, ...user } }) => ({
        subjectId: user.id,
        name: user.name || (user.email ?? user.id),
        user,
        limit: gatewaySpendLimits[0] ?? null,
      })),
    };
  }

  /** Each user's first user limit in the organization. */
  async listFirstForUsers(params: {
    organizationId: string;
    userIds: string[];
  }) {
    if (params.userIds.length === 0) return [];
    return this.prisma.gatewaySpendLimit.findMany({
      where: {
        organizationId: params.organizationId,
        scope: "USER",
        userId: { in: params.userIds },
      },
      select: GATEWAY_SPEND_LIMIT_SELECT,
      orderBy: { createdAt: "asc" },
      distinct: ["userId"],
    });
  }

  /** Each key's first limit, for keys in the organization and, with ownerUserId, owned by that user. */
  async listFirstForApiKeys(params: {
    organizationId: string;
    ownerUserId?: string;
    apiKeyIds: string[];
  }) {
    if (params.apiKeyIds.length === 0) return [];
    return this.prisma.gatewaySpendLimit.findMany({
      where: {
        organizationId: params.organizationId,
        apiKeyId: { in: params.apiKeyIds },
        ...(params.ownerUserId !== undefined && {
          apiKey: { userId: params.ownerUserId },
        }),
      },
      select: GATEWAY_SPEND_LIMIT_SELECT,
      orderBy: { createdAt: "asc" },
      distinct: ["apiKeyId"],
    });
  }

  create({
    scope,
    ...params
  }: {
    organizationId: string;
    scope: GatewaySpendLimitScope;
    interval: GatewaySpendLimitInterval;
    limitUsd: number;
    countingStartedAt: Date;
    ownerUserId: string;
  }) {
    return this.prisma.gatewaySpendLimit.create({
      data: { ...params, ...toScopeColumns(scope) },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  createDefault({
    scope,
    ...params
  }: {
    organizationId: string;
    scope: GatewaySpendLimitScope["type"];
    interval: GatewaySpendLimitInterval;
    limitUsd: number;
    countingStartedAt: Date;
    ownerUserId: string;
  }) {
    return this.prisma.gatewaySpendLimit.create({
      data: { ...params, scope: GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES[scope] },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  /**
   * A new amount can be reached again in the same window, so its alerts are
   * cleared. Run it in a transaction so both writes land together.
   */
  async updateLimit(params: { id: string; limitUsd: number; userId: string }) {
    await this.prisma.gatewaySpendLimitAlert.deleteMany({
      where: { spendLimitId: params.id },
    });
    return this.prisma.gatewaySpendLimit.update({
      where: { id: params.id },
      data: { limitUsd: params.limitUsd, ownerUserId: params.userId },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  delete(params: { id: string }) {
    return this.prisma.gatewaySpendLimit.delete({
      where: { id: params.id },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }
}
