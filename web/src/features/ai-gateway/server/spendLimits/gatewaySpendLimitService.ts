import {
  ForbiddenError,
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import {
  Prisma,
  Role,
  type GatewaySpendLimitInterval,
  type PrismaClient,
} from "@langfuse/shared/src/db";
import { organizationRoleAccessRights } from "@langfuse/shared/rbac";
import { getGatewaySpendSinceFromEvents } from "@langfuse/shared/src/server";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { getGatewaySpendLimitWindowStart } from "@/src/features/ai-gateway/fns/gatewaySpendLimitWindow";
import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";
import {
  invalidateGatewayResolveCacheForApiKey,
  invalidateGatewayResolveCacheForOrganization,
} from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { GatewayApiKeyRepository } from "@/src/features/ai-gateway/server/apiKey/gatewayApiKeyRepository";
import {
  getKeyOwnerFilter,
  type GatewayUsageScope,
} from "@/src/features/ai-gateway/server/gatewayUsageScope";
import type { GatewayBudgetStatus } from "@/src/features/ai-gateway/constants/gatewayBudgetStatuses";
import { GATEWAY_USER_SCOPE } from "@/src/features/ai-gateway/server/team/gatewayTeamService";
import {
  GatewaySpendLimitRepository,
  type GatewaySpendLimitRecord,
} from "./gatewaySpendLimitRepository";
import {
  type GatewaySpendLimitScope,
  toSpendLimitScope,
} from "./gatewaySpendLimitScope";

const GATEWAY_MEMBER_ROLES = Object.values(Role).filter((role) =>
  organizationRoleAccessRights[role].includes(GATEWAY_USER_SCOPE),
);

const GATEWAY_SPEND_LIMITS_UNAVAILABLE_REASON =
  "Please switch to ingestion mode usage to enable this";

type SpendLimitInput = {
  interval: GatewaySpendLimitInterval;
  limitUsd: number;
};

type SetForApiKeyParams = {
  organizationId: string;
  usageScope: GatewayUsageScope;
  apiKeyId: string;
  limit: SpendLimitInput | null;
  session: OrgAuthedContext["session"];
};

/**
 * Gateway spend limits, each capping one scope: an API key, set together with
 * the key or later by a gateway manager, or a user, capping all of the user's keys in the organization and
 * set only by gateway managers. Spend is read from the gateway ingestion project, so
 * limits can only be set while gateway requests are recorded. Every write
 * drops the cached /resolve context of the keys the scope covers, so the
 * gateway sees the change on their next request.
 *
 * Gateway managers may change every limit. Other gateway members may set
 * limits on their own keys and change only the limits they own. Whoever last
 * set a limit owns it, so a member cannot undo a manager's change.
 */
export class GatewaySpendLimitService {
  private readonly repository: GatewaySpendLimitRepository;
  private readonly apiKeys: GatewayApiKeyRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new GatewaySpendLimitRepository(prisma);
    this.apiKeys = new GatewayApiKeyRepository(prisma);
  }

  /**
   * What ClickHouse has recorded against each key's first limit in its current
   * window, the limit the key list shows. Keys without a limit are absent. The
   * gateway enforces against its own counters, which run ahead of ClickHouse
   * by the ingestion delay.
   */
  async getApiKeysSpend(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    apiKeyIds: string[];
  }) {
    const recordingProjectId = await this.getRecordingProjectId(
      params.organizationId,
    );
    if (!recordingProjectId) return { available: false, apiKeys: [] };
    const limits = await this.repository.listFirstForApiKeys({
      organizationId: params.organizationId,
      ownerUserId: getKeyOwnerFilter(params.usageScope),
      apiKeyIds: params.apiKeyIds,
    });
    const now = new Date();
    const counted = limits.flatMap((limit) =>
      limit.apiKeyId
        ? [
            {
              apiKeyId: limit.apiKeyId,
              since: new Date(
                Math.max(
                  getGatewaySpendLimitWindowStart(
                    limit.interval,
                    now,
                  ).getTime(),
                  limit.countingStartedAt.getTime(),
                ),
              ),
            },
          ]
        : [],
    );
    const spend = new Map(
      (
        await getGatewaySpendSinceFromEvents({
          projectId: recordingProjectId,
          scope: "API_KEY",
          subjects: counted.map(({ apiKeyId, since }) => ({
            id: apiKeyId,
            since,
          })),
        })
      ).map(({ id, spendUsd }) => [id, spendUsd]),
    );
    return {
      available: true,
      apiKeys: counted.map(({ apiKeyId }) => ({
        id: apiKeyId,
        spentUsd: spend.get(apiKeyId) ?? 0,
      })),
    };
  }

  /**
   * Each user's first user limit, with what ClickHouse has recorded against it
   * in its current window; `spentUsd` is absent while spend is not recorded.
   * Users without a limit are absent. Members see only their own.
   */
  async getUsersSpend(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    userIds: string[];
  }) {
    const ownUserId = getKeyOwnerFilter(params.usageScope);
    const limits = await this.repository.listFirstForUsers({
      organizationId: params.organizationId,
      userIds:
        ownUserId === undefined
          ? params.userIds
          : params.userIds.filter((userId) => userId === ownUserId),
    });
    const recordingProjectId =
      limits.length > 0
        ? await this.getRecordingProjectId(params.organizationId)
        : null;
    const now = new Date();
    const counted = limits.flatMap((limit) =>
      limit.userId
        ? [
            {
              limit,
              userId: limit.userId,
              since: new Date(
                Math.max(
                  getGatewaySpendLimitWindowStart(
                    limit.interval,
                    now,
                  ).getTime(),
                  limit.countingStartedAt.getTime(),
                ),
              ),
            },
          ]
        : [],
    );
    const spend = recordingProjectId
      ? new Map(
          (
            await getGatewaySpendSinceFromEvents({
              projectId: recordingProjectId,
              scope: "USER",
              subjects: counted.map(({ userId, since }) => ({
                id: userId,
                since,
              })),
            })
          ).map(({ id, spendUsd }) => [id, spendUsd]),
        )
      : null;
    return counted.map(({ limit, userId }) => ({
      id: userId,
      spendLimit: {
        interval: limit.interval,
        limitUsd: limit.limitUsd.toNumber(),
      },
      spentUsd: spend ? (spend.get(userId) ?? 0) : undefined,
    }));
  }

  /**
   * One page of gateway keys or users, each with its budget, if any, and what
   * ClickHouse has recorded against it in its current window; `spentUsd` is
   * absent while spend is not recorded. Members see only their own keys, and
   * may edit only budgets they set; only gateway managers list users.
   *
   * Whether a budget is exceeded is only known from ClickHouse, so for
   * `exceeded` every budget is read and paged after filtering.
   */
  async listBudgets(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    scope: GatewaySpendLimitScope["type"];
    searchQuery?: string;
    status: GatewayBudgetStatus;
    page: number;
    limit: number;
  }) {
    const page = { page: params.page, limit: params.limit };
    const ownerUserId = getKeyOwnerFilter(params.usageScope);
    const listed =
      params.status === "all" || params.status === "unlimited"
        ? await this.repository.listSubjectsPage({
            organizationId: params.organizationId,
            scope: params.scope,
            memberRoles: GATEWAY_MEMBER_ROLES,
            ownerUserId,
            searchQuery: params.searchQuery,
            unlimitedOnly: params.status === "unlimited",
            page,
          })
        : await this.listBudgetedSubjects({
            ...params,
            ownerUserId,
            page: params.status === "exceeded" ? undefined : page,
          });
    const rows = await this.withSpend({ ...params, rows: listed.rows });
    if (params.status !== "exceeded") {
      return { totalCount: listed.totalCount, rows };
    }

    const exceeded = rows.filter(
      ({ spentUsd, spendLimit }) =>
        spendLimit !== null &&
        spentUsd !== undefined &&
        spentUsd >= spendLimit.limitUsd,
    );
    return {
      totalCount: exceeded.length,
      rows: exceeded.slice(
        page.page * page.limit,
        (page.page + 1) * page.limit,
      ),
    };
  }

  private async listBudgetedSubjects(params: {
    organizationId: string;
    scope: GatewaySpendLimitScope["type"];
    ownerUserId?: string;
    searchQuery?: string;
    page?: { page: number; limit: number };
  }) {
    const { rows, totalCount } = await this.repository.listPage(params);
    return {
      totalCount,
      rows: rows.flatMap((row) => {
        if (params.scope === "API_KEY") {
          return row.apiKeyId && row.apiKey
            ? [
                {
                  subjectId: row.apiKeyId,
                  name: row.apiKey.note ?? row.apiKey.displaySecretKey,
                  user: row.apiKey.user,
                  limit: row,
                },
              ]
            : [];
        }
        return row.userId && row.user
          ? [
              {
                subjectId: row.userId,
                name: row.user.name || (row.user.email ?? row.userId),
                user: row.user,
                limit: row,
              },
            ]
          : [];
      }),
    };
  }

  private async withSpend(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    scope: GatewaySpendLimitScope["type"];
    rows: {
      subjectId: string;
      name: string;
      user: {
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
      } | null;
      limit: GatewaySpendLimitRecord | null;
    }[];
  }) {
    const ownUserId = getKeyOwnerFilter(params.usageScope);
    const budgeted = params.rows.flatMap(({ subjectId, limit }) =>
      limit ? [{ subjectId, limit }] : [],
    );
    const recordingProjectId =
      budgeted.length > 0
        ? await this.getRecordingProjectId(params.organizationId)
        : null;
    const now = new Date();
    const spend = recordingProjectId
      ? new Map(
          (
            await getGatewaySpendSinceFromEvents({
              projectId: recordingProjectId,
              scope: params.scope,
              subjects: budgeted.map(({ subjectId, limit }) => ({
                id: subjectId,
                since: new Date(
                  Math.max(
                    getGatewaySpendLimitWindowStart(
                      limit.interval,
                      now,
                    ).getTime(),
                    limit.countingStartedAt.getTime(),
                  ),
                ),
              })),
            })
          ).map(({ id, spendUsd }) => [id, spendUsd]),
        )
      : null;

    return params.rows.map(({ subjectId, name, user, limit }) => ({
      id: subjectId,
      subjectId,
      name,
      user,
      spendLimit: limit
        ? { interval: limit.interval, limitUsd: limit.limitUsd.toNumber() }
        : null,
      spentUsd: limit && spend ? (spend.get(subjectId) ?? 0) : undefined,
      // Members may add a budget to their own keys, and change only budgets they set.
      isEditable:
        ownUserId === undefined ||
        (params.scope === "API_KEY" &&
          (limit === null || limit.ownerUserId === ownUserId)),
    }));
  }

  /**
   * Gives each key or user the same spend limit; callers must be gateway
   * managers. Refuses all of them, before writing any, if one already has a
   * limit.
   */
  async createForSubjects(params: {
    organizationId: string;
    scope: GatewaySpendLimitScope["type"];
    subjectIds: string[];
    limit: SpendLimitInput;
    session: OrgAuthedContext["session"];
  }) {
    const applies = [];
    for (const subjectId of params.subjectIds) {
      const scope = toSpendLimitScope(params.scope, subjectId);
      const existing = await this.repository.list({
        organizationId: params.organizationId,
        scope,
      });
      if (existing.length > 0) {
        throw new LangfuseConflictError(
          params.scope === "API_KEY"
            ? "A selected key already has a spend budget"
            : "A selected user already has a spend budget",
        );
      }
      applies.push(
        await this.prepareSet({
          organizationId: params.organizationId,
          usageScope: { scope: "organization" },
          scope,
          limit: params.limit,
          session: params.session,
        }),
      );
    }
    for (const apply of applies) await apply();
  }

  /**
   * Makes `limit` the only spend limit of each key or user, or removes theirs
   * when it is null. Every subject is checked before any is written, so a
   * refused one leaves all of them as they were.
   */
  async setForSubjects(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    scope: GatewaySpendLimitScope["type"];
    subjectIds: string[];
    limit: SpendLimitInput | null;
    session: OrgAuthedContext["session"];
  }) {
    const applies = [];
    for (const subjectId of params.subjectIds) {
      applies.push(
        await this.prepareSet({
          ...params,
          scope: toSpendLimitScope(params.scope, subjectId),
        }),
      );
    }
    for (const apply of applies) await apply();
  }

  /** Throws unless limits can be set, so a caller can check before writing anything else. */
  async requireAvailable(organizationId: string) {
    await this.requireRecordingProjectId(organizationId);
  }

  /**
   * Makes `limit` the key's only spend limit, or removes all of them when it
   * is null. An unchanged limit is left alone, so it keeps counting. The new
   * limit is written before others are removed, so a refused write leaves the
   * key's limits as they were.
   */
  async setForApiKey(params: SetForApiKeyParams) {
    const apply = await this.prepareSetForApiKey(params);
    await apply();
  }

  /**
   * Runs the checks of `setForApiKey` and returns the write, so a caller can
   * refuse a request before changing anything else.
   */
  prepareSetForApiKey(
    params: SetForApiKeyParams,
  ): Promise<() => Promise<void>> {
    return this.prepareSet({
      ...params,
      scope: { type: "API_KEY", apiKeyId: params.apiKeyId },
    });
  }

  /**
   * Makes `limit` the scope's only spend limit, or removes all of them when it
   * is null, after checking the caller may.
   */
  private async prepareSet(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    scope: GatewaySpendLimitScope;
    limit: SpendLimitInput | null;
    session: OrgAuthedContext["session"];
  }): Promise<() => Promise<void>> {
    const { limit, organizationId, session, scope } = params;
    const subject = await this.requireSubject(params);
    const existing = await this.repository.list({ organizationId, scope });
    const kept = limit
      ? existing.find((candidate) => candidate.interval === limit.interval)
      : undefined;
    const isUnchanged =
      kept !== undefined && kept.limitUsd.toNumber() === limit?.limitUsd;
    const changed = existing.filter(
      (candidate) => candidate !== kept || !isUnchanged,
    );
    const ownerUserId = getKeyOwnerFilter(params.usageScope);
    if (
      ownerUserId !== undefined &&
      changed.some((candidate) => candidate.ownerUserId !== ownerUserId)
    ) {
      throw new ForbiddenError(
        "A gateway admin set this key's spend budget, so only an admin can change it.",
      );
    }
    if (limit && !isUnchanged) {
      await this.requireRecordingProjectId(organizationId);
    }

    return async () => {
      if (limit && !kept) {
        await this.create({ organizationId, scope, ...limit, session });
      } else if (limit && kept && !isUnchanged) {
        await this.update({ before: kept, limitUsd: limit.limitUsd, session });
      }
      for (const candidate of existing) {
        if (candidate !== kept) {
          await this.delete({ before: candidate, session });
        }
      }
      if (changed.length > 0 || (limit && !kept)) {
        await subject.invalidateResolveCache();
      }
    };
  }

  private async create(params: {
    organizationId: string;
    scope: GatewaySpendLimitScope;
    interval: GatewaySpendLimitInterval;
    limitUsd: number;
    session: OrgAuthedContext["session"];
  }) {
    let limit: GatewaySpendLimitRecord;
    try {
      limit = await this.repository.create({
        organizationId: params.organizationId,
        scope: params.scope,
        interval: params.interval,
        limitUsd: params.limitUsd,
        countingStartedAt: new Date(),
        ownerUserId: params.session.user.id,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new LangfuseConflictError(
          "A spend limit for this interval already exists",
        );
      }
      throw error;
    }
    await this.audit({
      session: params.session,
      action: "create",
      after: limit,
    });
  }

  private async update(params: {
    before: GatewaySpendLimitRecord;
    limitUsd: number;
    session: OrgAuthedContext["session"];
  }) {
    const after = await this.prisma.$transaction((tx) =>
      new GatewaySpendLimitRepository(tx).updateLimit({
        id: params.before.id,
        limitUsd: params.limitUsd,
        userId: params.session.user.id,
      }),
    );
    await this.audit({
      session: params.session,
      action: "update",
      before: params.before,
      after,
    });
  }

  /** Deleting stays possible without ingestion, so a limit can always be removed. */
  private async delete(params: {
    before: GatewaySpendLimitRecord;
    session: OrgAuthedContext["session"];
  }) {
    await this.repository.delete({ id: params.before.id });
    await this.audit({
      session: params.session,
      action: "delete",
      before: params.before,
    });
  }

  /** What the scope applies to, if the caller may see it. */
  private async requireSubject(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    scope: GatewaySpendLimitScope;
  }) {
    switch (params.scope.type) {
      case "API_KEY": {
        const apiKey = await this.apiKeys.getGatewayApiKeyForSpendLimits({
          organizationId: params.organizationId,
          ownerUserId: getKeyOwnerFilter(params.usageScope),
          apiKeyId: params.scope.apiKeyId,
        });
        if (!apiKey) throw new LangfuseNotFoundError("Gateway key not found");
        return {
          invalidateResolveCache: async () => {
            if (apiKey.fastHashedSecretKey) {
              await invalidateGatewayResolveCacheForApiKey(
                apiKey.fastHashedSecretKey,
              );
            }
          },
        };
      }
      case "USER": {
        const membership = await this.prisma.organizationMembership.findUnique({
          where: {
            orgId_userId: {
              orgId: params.organizationId,
              userId: params.scope.userId,
            },
          },
          select: { orgId: true },
        });
        if (!membership) throw new LangfuseNotFoundError("User not found");
        return {
          // Every key of the user resolves the limit, so all of them are dropped.
          invalidateResolveCache: () =>
            invalidateGatewayResolveCacheForOrganization(params.organizationId),
        };
      }
    }
  }

  private getRecordingProjectId(organizationId: string) {
    return new GatewayConfigService(this.prisma).getRecordingProjectId(
      organizationId,
    );
  }

  private async requireRecordingProjectId(organizationId: string) {
    const projectId = await this.getRecordingProjectId(organizationId);
    if (!projectId) {
      throw new InvalidRequestError(GATEWAY_SPEND_LIMITS_UNAVAILABLE_REASON);
    }
    return projectId;
  }

  private audit(params: {
    session: OrgAuthedContext["session"];
    action: "create" | "update" | "delete";
    before?: GatewaySpendLimitRecord;
    after?: GatewaySpendLimitRecord;
  }) {
    const limit = params.after ?? params.before!;
    return auditLog(
      {
        session: params.session,
        resourceType: "gatewaySpendLimit",
        resourceId: limit.id,
        action: params.action,
        before: params.before,
        after: params.after,
      },
      this.prisma,
    );
  }
}
