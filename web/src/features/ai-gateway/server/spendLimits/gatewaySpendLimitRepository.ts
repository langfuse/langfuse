import type {
  GatewaySpendLimitInterval,
  Prisma,
  PrismaClient,
  Role,
} from "@langfuse/shared/src/db";
import { escapeSqlLikePattern } from "@langfuse/shared/src/server";
import {
  DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS,
  type GatewaySpendBudgetAlertThreshold,
} from "@/src/features/ai-gateway/constants/gatewaySpendBudgetAlertThresholds";
import {
  gatewayApiKeySearch,
  gatewayApiKeyWhere,
} from "@/src/features/ai-gateway/server/apiKey/gatewayApiKeyRepository";
import { GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES } from "./gatewayDefaultSpendLimits";
import type { GATEWAY_ORGANIZATION_SPEND_LIMIT_SCOPE } from "./gatewayOrganizationSpendLimitScope";
import { GATEWAY_SPEND_LIMIT_DTO_SELECT } from "./gatewaySpendLimitDto";
import { gatewaySpendLimitsNotOwnedBy } from "./gatewaySpendLimitsNotOwnedBy";
import {
  type GatewaySpendLimitScope,
  toScopeColumns,
} from "./gatewaySpendLimitScope";

const GATEWAY_SPEND_LIMIT_SELECT = {
  id: true,
  scope: true,
  apiKeyId: true,
  userId: true,
  ...GATEWAY_SPEND_LIMIT_DTO_SELECT,
  countingStartedAt: true,
  ownerUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Defaults and organization limits have no subject; filtering on it lets Postgres use their partial unique index. */
const DEFAULT_SPEND_LIMIT_SUBJECT = { apiKeyId: null, userId: null } as const;

const BUDGET_USER_SELECT = {
  select: { id: true, name: true, email: true, image: true },
} as const;

/** The scopes without a subject column, each with at most one limit per organization. */
export type GatewaySubjectlessSpendLimitScope =
  | (typeof GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES)[keyof typeof GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES]
  | typeof GATEWAY_ORGANIZATION_SPEND_LIMIT_SCOPE;

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
    return this.findSubjectless({
      organizationId: params.organizationId,
      scope: GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES[params.scope],
    });
  }

  /** The organization's one limit of a scope without a subject: a default, or its own limit. */
  findSubjectless(params: {
    organizationId: string;
    scope: GatewaySubjectlessSpendLimitScope;
  }) {
    return this.prisma.gatewaySpendLimit.findFirst({
      where: { ...params, ...DEFAULT_SPEND_LIMIT_SUBJECT },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  listDefaults(organizationId: string) {
    return this.prisma.gatewaySpendLimit.findMany({
      where: {
        organizationId,
        scope: { in: Object.values(GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES) },
        ...DEFAULT_SPEND_LIMIT_SUBJECT,
      },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  /**
   * One page of the organization's gateway keys, or of its members with one
   * of `memberRoles`, each with its spend limit if it has one. Search matches
   * the key name and the name or email of its user, or the user's name or
   * email; with ownerUserId, only that user's keys or own entry are listed.
   * `budget` narrows them to those with or without a limit.
   */
  async listSubjectsPage(params: {
    organizationId: string;
    scope: "API_KEY" | "USER";
    memberRoles: Role[];
    ownerUserId?: string;
    searchQuery?: string;
    budget: "any" | "with" | "without";
    /** Without a page, all of them. */
    page?: { page: number; limit: number };
  }) {
    const skip = params.page ? params.page.page * params.page.limit : undefined;
    const take = params.page?.limit;
    const limitWhere = {
      organizationId: params.organizationId,
      scope: params.scope,
    } as const;
    // Counts every limit, not just the listed first one, so members see the same answer the reset check gives.
    const notOwnedWhere = {
      ...limitWhere,
      ...(params.ownerUserId !== undefined &&
        gatewaySpendLimitsNotOwnedBy(params.ownerUserId)),
    };

    if (params.scope === "API_KEY") {
      const where: Prisma.ApiKeyWhereInput = {
        ...gatewayApiKeyWhere(params),
        gatewayAssociation: { isNot: null },
        ...(params.searchQuery && gatewayApiKeySearch(params.searchQuery)),
        ...(params.budget === "with" && { gatewaySpendLimits: { some: {} } }),
        ...(params.budget === "without" && {
          gatewaySpendLimits: { none: {} },
        }),
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
            _count: {
              select: { gatewaySpendLimits: { where: notOwnedWhere } },
            },
          },
          orderBy: [{ note: { sort: "asc", nulls: "last" } }, { id: "asc" }],
          skip,
          take,
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
          limitsNotOwnedCount: key._count.gatewaySpendLimits,
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
        ...(params.budget === "with" && {
          gatewaySpendLimits: { some: limitWhere },
        }),
        ...(params.budget === "without" && {
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
              _count: {
                select: { gatewaySpendLimits: { where: notOwnedWhere } },
              },
            },
          },
        },
        orderBy: [
          { user: { name: { sort: "asc", nulls: "last" } } },
          { userId: "asc" },
        ],
        skip,
        take,
      }),
      this.prisma.organizationMembership.count({ where }),
    ]);
    return {
      totalCount,
      rows: memberships.map(
        ({ user: { gatewaySpendLimits, _count, ...user } }) => ({
          subjectId: user.id,
          name: user.name || (user.email ?? user.id),
          user,
          limit: gatewaySpendLimits[0] ?? null,
          limitsNotOwnedCount: _count.gatewaySpendLimits,
        }),
      ),
    };
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
    alertThresholds = [...DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS],
    ...params
  }: {
    organizationId: string;
    scope: GatewaySpendLimitScope;
    interval: GatewaySpendLimitInterval;
    limitUsd: number;
    alertThresholds?: GatewaySpendBudgetAlertThreshold[];
    countingStartedAt: Date;
    ownerUserId: string | null;
  }) {
    return this.prisma.gatewaySpendLimit.create({
      data: { ...params, alertThresholds, ...toScopeColumns(scope) },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  createSubjectless(data: {
    organizationId: string;
    scope: GatewaySubjectlessSpendLimitScope;
    interval: GatewaySpendLimitInterval;
    limitUsd: number;
    alertThresholds?: GatewaySpendBudgetAlertThreshold[];
    countingStartedAt: Date;
    ownerUserId: string;
  }) {
    return this.prisma.gatewaySpendLimit.create({
      data: {
        ...data,
        alertThresholds: data.alertThresholds ?? [
          ...DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS,
        ],
      },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  /**
   * A new amount can be reached again in the same window, so its alerts are
   * cleared. Changing only alert thresholds keeps existing alerts so already
   * sent ones are not repeated. Run it in a transaction so writes land together.
   */
  async updateLimit(params: {
    id: string;
    limitUsd: number;
    alertThresholds: GatewaySpendBudgetAlertThreshold[];
    clearAlerts: boolean;
    userId: string;
  }) {
    if (params.clearAlerts) {
      await this.prisma.gatewaySpendLimitAlert.deleteMany({
        where: { spendLimitId: params.id },
      });
    }
    return this.prisma.gatewaySpendLimit.update({
      where: { id: params.id },
      data: {
        limitUsd: params.limitUsd,
        alertThresholds: params.alertThresholds,
        ownerUserId: params.userId,
      },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  /** Locks the scope's own limits in deterministic order so concurrent resets serialize monotonically. */
  async listForUpdate(params: {
    organizationId: string;
    scope: GatewaySpendLimitScope;
  }) {
    if (params.scope.type === "API_KEY") {
      await this.prisma.$queryRaw`
        SELECT "id"
        FROM "gateway_spend_limits"
        WHERE "organization_id" = ${params.organizationId}
          AND "scope" = 'API_KEY'::"GatewaySpendLimitScope"
          AND "api_key_id" = ${params.scope.apiKeyId}
        ORDER BY "id" ASC
        FOR UPDATE
      `;
    } else {
      await this.prisma.$queryRaw`
        SELECT "id"
        FROM "gateway_spend_limits"
        WHERE "organization_id" = ${params.organizationId}
          AND "scope" = 'USER'::"GatewaySpendLimitScope"
          AND "user_id" = ${params.scope.userId}
        ORDER BY "id" ASC
        FOR UPDATE
      `;
    }
    return this.list(params);
  }

  resetCountingStartedAt(params: { id: string; countingStartedAt: Date }) {
    return this.prisma.gatewaySpendLimit.update({
      where: { id: params.id },
      data: { countingStartedAt: params.countingStartedAt },
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
