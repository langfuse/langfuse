import {
  ForbiddenError,
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import {
  Prisma,
  type GatewaySpendLimitInterval,
  type PrismaClient,
} from "@langfuse/shared/src/db";
import {
  getGatewayApiKeySpendSinceFromEvents,
  getGatewayApiKeysSpendSinceFromEvents,
  getGatewayUsersSpendSinceFromEvents,
} from "@langfuse/shared/src/server";

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
import {
  GatewaySpendLimitRepository,
  type GatewaySpendLimitRecord,
} from "./gatewaySpendLimitRepository";
import type { GatewaySpendLimitScope } from "./gatewaySpendLimitScope";

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

type UserSpendLimitParams = {
  organizationId: string;
  userId: string;
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
              limit,
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
        await getGatewayApiKeysSpendSinceFromEvents({
          projectId: recordingProjectId,
          apiKeys: counted,
        })
      ).map(({ id, spendUsd }) => [id, spendUsd]),
    );
    return {
      available: true,
      apiKeys: counted.map(({ limit, apiKeyId }) => ({
        id: apiKeyId,
        spentUsd: (spend.get(apiKeyId) ?? 0) + baselineUsd(limit, now),
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
            await getGatewayUsersSpendSinceFromEvents({
              projectId: recordingProjectId,
              users: counted,
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
      spentUsd: spend
        ? (spend.get(userId) ?? 0) + baselineUsd(limit, now)
        : undefined,
    }));
  }

  /**
   * One page of key or user budgets, with what ClickHouse has recorded against
   * each in its current window; `spentUsd` is absent while spend is not
   * recorded. Members see only their own keys' budgets and their own user
   * budget, and may edit only key budgets they set.
   */
  async listBudgets(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    scope: "API_KEY" | "USER";
    searchQuery?: string;
    page: number;
    limit: number;
  }) {
    const ownUserId = getKeyOwnerFilter(params.usageScope);
    const { rows, totalCount } = await this.repository.listPage({
      organizationId: params.organizationId,
      scope: params.scope,
      ownerUserId: ownUserId,
      searchQuery: params.searchQuery,
      page: params.page,
      limit: params.limit,
    });
    const recordingProjectId =
      rows.length > 0
        ? await this.getRecordingProjectId(params.organizationId)
        : null;
    const now = new Date();
    const sinceOf = (limit: GatewaySpendLimitRecord) =>
      new Date(
        Math.max(
          getGatewaySpendLimitWindowStart(limit.interval, now).getTime(),
          limit.countingStartedAt.getTime(),
        ),
      );
    const isEditable = (limit: GatewaySpendLimitRecord) =>
      ownUserId === undefined ||
      (params.scope === "API_KEY" && limit.ownerUserId === ownUserId);
    const toBudget = (
      limit: GatewaySpendLimitRecord,
      spend: number | null,
    ) => ({
      id: limit.id,
      spendLimit: {
        interval: limit.interval,
        limitUsd: limit.limitUsd.toNumber(),
      },
      spentUsd: spend === null ? undefined : spend + baselineUsd(limit, now),
      isEditable: isEditable(limit),
    });

    if (params.scope === "API_KEY") {
      const keyed = rows.flatMap((row) =>
        row.apiKeyId && row.apiKey
          ? [{ row, apiKeyId: row.apiKeyId, apiKey: row.apiKey }]
          : [],
      );
      const spend = recordingProjectId
        ? new Map(
            (
              await getGatewayApiKeysSpendSinceFromEvents({
                projectId: recordingProjectId,
                apiKeys: keyed.map(({ row, apiKeyId }) => ({
                  apiKeyId,
                  since: sinceOf(row),
                })),
              })
            ).map(({ id, spendUsd }) => [id, spendUsd]),
          )
        : null;
      return {
        totalCount,
        rows: keyed.map(({ row, apiKeyId, apiKey }) => ({
          ...toBudget(row, spend ? (spend.get(apiKeyId) ?? 0) : null),
          subjectId: apiKeyId,
          name: apiKey.note ?? apiKey.displaySecretKey,
          user: apiKey.user,
          keyCount: undefined,
        })),
      };
    }

    const owned = rows.flatMap((row) =>
      row.userId && row.user
        ? [{ row, userId: row.userId, user: row.user }]
        : [],
    );
    const [spend, keyCounts] = await Promise.all([
      recordingProjectId
        ? getGatewayUsersSpendSinceFromEvents({
            projectId: recordingProjectId,
            users: owned.map(({ row, userId }) => ({
              userId,
              since: sinceOf(row),
            })),
          }).then(
            (spent) => new Map(spent.map(({ id, spendUsd }) => [id, spendUsd])),
          )
        : null,
      this.apiKeys.countGatewayApiKeysByUser({
        organizationId: params.organizationId,
        userIds: owned.map(({ userId }) => userId),
      }),
    ]);
    return {
      totalCount,
      rows: owned.map(({ row, userId, user }) => ({
        ...toBudget(row, spend ? (spend.get(userId) ?? 0) : null),
        subjectId: userId,
        name: user.name || (user.email ?? userId),
        user,
        keyCount: keyCounts.get(userId) ?? 0,
      })),
    };
  }

  /** Gives a key without one a spend limit; callers must be gateway managers. */
  async createForApiKey(params: {
    organizationId: string;
    apiKeyId: string;
    limit: SpendLimitInput;
    session: OrgAuthedContext["session"];
  }) {
    const scope = { type: "API_KEY", apiKeyId: params.apiKeyId } as const;
    const existing = await this.repository.list({
      organizationId: params.organizationId,
      scope,
    });
    if (existing.length > 0) {
      throw new LangfuseConflictError("This key already has a spend budget");
    }
    const apply = await this.prepareSet({
      organizationId: params.organizationId,
      usageScope: { scope: "organization" },
      scope,
      limit: params.limit,
      session: params.session,
    });
    await apply();
  }

  /** Gives a user without one a spend limit. */
  async createForUser(
    params: UserSpendLimitParams & { limit: SpendLimitInput },
  ) {
    await this.setForUser({ ...params, hasLimit: false });
  }

  /** Replaces the user's spend limit; a new interval starts counting anew. */
  async updateForUser(
    params: UserSpendLimitParams & { limit: SpendLimitInput },
  ) {
    await this.setForUser({ ...params, hasLimit: true });
  }

  async deleteForUser(params: UserSpendLimitParams) {
    await this.setForUser({ ...params, limit: null, hasLimit: true });
  }

  /** Callers must be gateway managers; `hasLimit` is whether the user must already have a limit. */
  private async setForUser(
    params: UserSpendLimitParams & {
      limit: SpendLimitInput | null;
      hasLimit: boolean;
    },
  ) {
    const scope = { type: "USER", userId: params.userId } as const;
    const existing = await this.repository.list({
      organizationId: params.organizationId,
      scope,
    });
    if (params.hasLimit && existing.length === 0) {
      throw new LangfuseNotFoundError("This user has no spend budget");
    }
    if (!params.hasLimit && existing.length > 0) {
      throw new LangfuseConflictError("This user already has a spend budget");
    }
    const apply = await this.prepareSet({
      organizationId: params.organizationId,
      usageScope: { scope: "organization" },
      scope,
      limit: params.limit,
      session: params.session,
    });
    await apply();
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
    const recordingProjectId =
      limit && !isUnchanged
        ? await this.requireRecordingProjectId(organizationId)
        : null;

    return async () => {
      if (limit && !kept && recordingProjectId) {
        await this.create({
          organizationId,
          scope,
          subjectCreatedAt: subject.createdAt,
          recordingProjectId,
          ...limit,
          session,
        });
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
    subjectCreatedAt: Date;
    recordingProjectId: string;
    interval: GatewaySpendLimitInterval;
    limitUsd: number;
    session: OrgAuthedContext["session"];
  }) {
    const countingStartedAt = new Date();
    const windowStart = getGatewaySpendLimitWindowStart(
      params.interval,
      countingStartedAt,
    );
    // A user's total budget counts from its creation, not over the user's history.
    // Otherwise a total limit's window starts at the epoch, so the subject's creation bounds the scan.
    const [baselineSpendUsd] =
      params.scope.type === "USER" && params.interval === "TOTAL"
        ? [0]
        : await getScopeSpendSince({
            projectId: params.recordingProjectId,
            scope: params.scope,
            since: [
              new Date(
                Math.max(
                  windowStart.getTime(),
                  params.subjectCreatedAt.getTime(),
                ),
              ),
            ],
          });
    let limit: GatewaySpendLimitRecord;
    try {
      limit = await this.repository.create({
        organizationId: params.organizationId,
        scope: params.scope,
        interval: params.interval,
        limitUsd: params.limitUsd,
        countingStartedAt,
        baselineSpendUsd: baselineSpendUsd ?? 0,
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
          createdAt: apiKey.createdAt,
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
          select: { createdAt: true },
        });
        if (!membership) throw new LangfuseNotFoundError("User not found");
        return {
          createdAt: membership.createdAt,
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

/** The baseline counts while the window containing the counting start is current, as in the gateway. */
function baselineUsd(limit: GatewaySpendLimitRecord, now: Date) {
  const current = getGatewaySpendLimitWindowStart(limit.interval, now);
  const counting = getGatewaySpendLimitWindowStart(
    limit.interval,
    limit.countingStartedAt,
  );
  return current.getTime() === counting.getTime()
    ? limit.baselineSpendUsd.toNumber()
    : 0;
}

/** USD the scope spent since each `since`, in the gateway ingestion project. */
function getScopeSpendSince(params: {
  projectId: string;
  scope: GatewaySpendLimitScope;
  since: Date[];
}) {
  switch (params.scope.type) {
    case "API_KEY":
      return getGatewayApiKeySpendSinceFromEvents({
        projectId: params.projectId,
        apiKeyId: params.scope.apiKeyId,
        since: params.since,
      });
    case "USER": {
      const { userId } = params.scope;
      return Promise.all(
        params.since.map(async (since) => {
          const [spend] = await getGatewayUsersSpendSinceFromEvents({
            projectId: params.projectId,
            users: [{ userId, since }],
          });
          return spend?.spendUsd ?? 0;
        }),
      );
    }
  }
}
