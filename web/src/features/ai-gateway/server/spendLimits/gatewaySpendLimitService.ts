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
import {
  getGatewaySpendSinceFromEvents,
  logger,
} from "@langfuse/shared/src/server";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import {
  DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS,
  type GatewaySpendBudgetAlertThreshold,
} from "@/src/features/ai-gateway/constants/gatewaySpendBudgetAlertThresholds";
import { areGatewaySpendBudgetAlertThresholdsEqual } from "@/src/features/ai-gateway/fns/spendLimits/areGatewaySpendBudgetAlertThresholdsEqual";
import { getGatewaySpendLimitWindowStart } from "@/src/features/ai-gateway/fns/gatewaySpendLimitWindow";
import { normalizeGatewaySpendBudgetAlertThresholds } from "@/src/features/ai-gateway/fns/spendLimits/normalizeGatewaySpendBudgetAlertThresholds";
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
import { toGatewaySpendLimitDto } from "./gatewaySpendLimitDto";
import {
  GatewaySpendLimitRepository,
  type GatewaySpendLimitRecord,
  type GatewaySubjectlessSpendLimitScope,
} from "./gatewaySpendLimitRepository";
import { GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES } from "./gatewayDefaultSpendLimits";
import { GATEWAY_ORGANIZATION_SPEND_LIMIT_SCOPE } from "./gatewayOrganizationSpendLimitScope";
import {
  type GatewaySpendLimitScope,
  toSpendLimitScope,
} from "./gatewaySpendLimitScope";

const GATEWAY_MEMBER_ROLES = Object.values(Role).filter((role) =>
  organizationRoleAccessRights[role].includes(GATEWAY_USER_SCOPE),
);

const BULK_WRITE_TIMEOUT_MS = 30_000;

const NO_SUBJECTS = { totalCount: 0, rows: [] };

const ADMIN_SET_BUDGET_RESET_FORBIDDEN =
  "A gateway admin set this key's spend budget, so only an admin can reset it.";

const GATEWAY_SPEND_LIMITS_UNAVAILABLE_REASON =
  "Please switch to ingestion mode usage to enable this";

type SpendLimitInput = {
  interval: GatewaySpendLimitInterval;
  limitUsd: number;
  alertThresholds?: GatewaySpendBudgetAlertThreshold[];
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
 * set only by gateway managers, or the whole organization, also set only by
 * gateway managers. Spend is read from the gateway ingestion project, so
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
   * window, the limit the key list shows, or else against the organization's
   * default key budget. Keys with neither are absent. The
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
    const ownerUserId = getKeyOwnerFilter(params.usageScope);
    const ownLimits = await this.repository.listFirstForApiKeys({
      organizationId: params.organizationId,
      ownerUserId,
      apiKeyIds: params.apiKeyIds,
    });
    const fallback = await this.repository.findDefault({
      organizationId: params.organizationId,
      scope: "API_KEY",
    });
    const withOwnLimit = new Set(ownLimits.map(({ apiKeyId }) => apiKeyId));
    const defaultLimits = fallback
      ? (
          await this.apiKeys.filterVisibleGatewayApiKeyIds({
            organizationId: params.organizationId,
            ownerUserId,
            apiKeyIds: params.apiKeyIds.filter((id) => !withOwnLimit.has(id)),
          })
        ).map((apiKeyId) => ({ ...fallback, apiKeyId }))
      : [];
    const budgeted = [...ownLimits, ...defaultLimits].flatMap((limit) =>
      limit.apiKeyId ? [{ subjectId: limit.apiKeyId, limit }] : [],
    );
    const spend = await readSpend(recordingProjectId, "API_KEY", budgeted);
    return {
      available: true,
      apiKeys: budgeted.map(({ subjectId }) => ({
        id: subjectId,
        spentUsd: spend.get(subjectId) ?? 0,
      })),
    };
  }

  /**
   * One page of gateway keys or users, each with its budget, if any, and what
   * ClickHouse has recorded against it in its current window; `spentUsd` is
   * absent while spend is not recorded. A key or user without a budget of its
   * own has the organization's default, if one is set. Members see only their
   * own keys, and may edit only budgets they set; only gateway managers list
   * users.
   */
  listBudgets(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    scope: GatewaySpendLimitScope["type"];
    searchQuery?: string;
    status: GatewayBudgetStatus;
    page: number;
    limit: number;
  }) {
    return this.listSubjects({
      ...params,
      page: { page: params.page, limit: params.limit },
    });
  }

  /**
   * Every key or user matching a search and status, as `listBudgets` lists
   * them, for changes to everything matching. Spend is read only when the
   * status needs it.
   */
  async listMatchingSubjects(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    scope: GatewaySpendLimitScope["type"];
    searchQuery?: string;
    status: GatewayBudgetStatus;
  }) {
    if (params.status === "exceeded") {
      const { rows } = await this.listSubjects(params);
      return rows.map(({ subjectId, name }) => ({ subjectId, name }));
    }
    const budget = toBudgetFilter(
      params.status,
      (await this.repository.findDefault(params)) !== null,
    );
    if (budget === null) return [];
    const { rows } = await this.repository.listSubjectsPage({
      organizationId: params.organizationId,
      scope: params.scope,
      memberRoles: GATEWAY_MEMBER_ROLES,
      ownerUserId: getKeyOwnerFilter(params.usageScope),
      searchQuery: params.searchQuery,
      budget,
    });
    return rows.map(({ subjectId, name }) => ({ subjectId, name }));
  }

  /**
   * The keys or users matching a search and status, with their budgets and
   * spend; without a page, all of them. Whether a budget is exceeded is only
   * known from ClickHouse, so for `exceeded` every budget is read and paged
   * after filtering.
   */
  private async listSubjects(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    scope: GatewaySpendLimitScope["type"];
    searchQuery?: string;
    status: GatewayBudgetStatus;
    page?: { page: number; limit: number };
  }) {
    const { page } = params;
    const fallback = await this.repository.findDefault(params);
    const budget = toBudgetFilter(params.status, fallback !== null);
    if (budget === null) return NO_SUBJECTS;
    const listed = await this.repository.listSubjectsPage({
      organizationId: params.organizationId,
      scope: params.scope,
      memberRoles: GATEWAY_MEMBER_ROLES,
      ownerUserId: getKeyOwnerFilter(params.usageScope),
      searchQuery: params.searchQuery,
      budget,
      page: params.status === "exceeded" ? undefined : page,
    });
    const rows = await this.withSpend({
      ...params,
      fallback,
      rows: listed.rows,
    });
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
      rows: page
        ? exceeded.slice(page.page * page.limit, (page.page + 1) * page.limit)
        : exceeded,
    };
  }

  private async withSpend(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    scope: GatewaySpendLimitScope["type"];
    rows: Awaited<
      ReturnType<GatewaySpendLimitRepository["listSubjectsPage"]>
    >["rows"];
    fallback: GatewaySpendLimitRecord | null;
  }) {
    const ownUserId = getKeyOwnerFilter(params.usageScope);
    const budgeted = params.rows.flatMap(({ subjectId, limit }) => {
      const applied = limit ?? params.fallback;
      return applied ? [{ subjectId, limit: applied }] : [];
    });
    const recordingProjectId =
      budgeted.length > 0
        ? await this.getRecordingProjectId(params.organizationId)
        : null;
    const spend = recordingProjectId
      ? await readSpend(recordingProjectId, params.scope, budgeted)
      : null;

    return params.rows.map(
      ({ subjectId, name, user, limit, limitsNotOwnedCount }) => {
        const applied = limit ?? params.fallback;
        const ownsAllLimits = limit !== null && limitsNotOwnedCount === 0;
        return {
          id: subjectId,
          subjectId,
          name,
          user,
          spendLimit: applied ? toGatewaySpendLimitDto(applied) : null,
          isDefault: limit === null && applied !== null,
          spentUsd: applied && spend ? (spend.get(subjectId) ?? 0) : undefined,
          // Members may add a budget to their own keys without the default, and change only budgets they set.
          isEditable:
            ownUserId === undefined ||
            (params.scope === "API_KEY" &&
              (limit === null ? params.fallback === null : ownsAllLimits)),
          canResetBudget: ownUserId === undefined || ownsAllLimits,
        };
      },
    );
  }

  /**
   * Gives each key or user the same spend limit. Only gateway managers add
   * user budgets; members add budgets only to their own keys. Refuses all of
   * them, before writing any, if one already has a limit.
   */
  async createForSubjects(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    scope: GatewaySpendLimitScope["type"];
    subjectIds: string[];
    limit: SpendLimitInput;
    session: OrgAuthedContext["session"];
  }) {
    const changes = [];
    for (const subjectId of params.subjectIds) {
      const scope = toSpendLimitScope(params.scope, subjectId);
      // Checks the caller may see the key or user before saying whether it has a budget.
      const change = await this.prepareChange({
        organizationId: params.organizationId,
        usageScope: params.usageScope,
        scope,
        limit: params.limit,
        session: params.session,
      });
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
      changes.push(change);
    }
    await this.applyChanges(changes);
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
    const changes = [];
    for (const subjectId of params.subjectIds) {
      changes.push(
        await this.prepareChange({
          ...params,
          scope: toSpendLimitScope(params.scope, subjectId),
        }),
      );
    }
    await this.applyChanges(changes);
  }

  /**
   * Zeros the current period's spend for one key or user budget while keeping
   * the limit intact. If the subject inherits the organization's default
   * budget, creates an explicit budget for the subject copied from the default
   * with a fresh counting start. Only gateway managers may reset user budgets
   * or another member's key; everyone else may reset only budgets they set on
   * their own keys, never one an admin set or the default.
   */
  async resetForSubject(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    scope: GatewaySpendLimitScope["type"];
    subjectId: string;
    session: OrgAuthedContext["session"];
  }) {
    if (params.scope === "USER" && params.usageScope.scope !== "organization") {
      throw new ForbiddenError("Only gateway admins can reset user budgets.");
    }
    const scope = toSpendLimitScope(params.scope, params.subjectId);
    const subject = await this.requireSubject({
      organizationId: params.organizationId,
      usageScope: params.usageScope,
      scope,
    });
    const ownerUserId = getKeyOwnerFilter(params.usageScope);

    const runReset = () =>
      this.prisma.$transaction(async (tx) => {
        const repo = new GatewaySpendLimitRepository(tx);
        const existing = await repo.listForUpdate({
          organizationId: params.organizationId,
          scope,
        });
        if (
          ownerUserId !== undefined &&
          existing.some((before) => before.ownerUserId !== ownerUserId)
        ) {
          throw new ForbiddenError(ADMIN_SET_BUDGET_RESET_FORBIDDEN);
        }
        if (existing.length > 0) {
          const now = new Date();
          for (const before of existing) {
            const after = await repo.resetCountingStartedAt({
              id: before.id,
              countingStartedAt: nextCountingStartedAt(
                before.countingStartedAt,
                now,
              ),
            });
            await audit(tx, {
              session: params.session,
              action: "reset",
              before,
              after,
            });
          }
          return;
        }

        const fallback = await repo.findDefault({
          organizationId: params.organizationId,
          scope: params.scope,
        });
        if (!fallback) {
          throw new LangfuseNotFoundError(
            params.scope === "API_KEY"
              ? "Gateway key has no spend budget"
              : "User has no spend budget",
          );
        }
        // Only gateway admins set the default, so members never own it.
        if (ownerUserId !== undefined) {
          throw new ForbiddenError(ADMIN_SET_BUDGET_RESET_FORBIDDEN);
        }
        const created = await repo.create({
          organizationId: params.organizationId,
          scope,
          interval: fallback.interval,
          limitUsd: fallback.limitUsd.toNumber(),
          alertThresholds: normalizeGatewaySpendBudgetAlertThresholds(
            fallback.alertThresholds,
          ),
          countingStartedAt: nextCountingStartedAt(
            fallback.countingStartedAt,
            new Date(),
          ),
          // Preserve the default's owner so members cannot subsequently edit or remove an admin-set default cap.
          ownerUserId: fallback.ownerUserId,
        });
        await audit(tx, {
          session: params.session,
          action: "reset",
          before: fallback,
          after: created,
        });
      });

    try {
      await runReset();
    } catch (error) {
      // Two concurrent first resets of a default-budgeted subject race on creating its row; retry onto the locked update path.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        await runReset();
      } else {
        throw error;
      }
    }
    await subject.invalidateResolveCache();
  }

  /** Throws unless limits can be set, so a caller can check before writing anything else. */
  async requireAvailable(organizationId: string) {
    await this.requireRecordingProjectId(organizationId);
  }

  /**
   * Makes `limit` the key's only spend limit, or removes all of them when it
   * is null. An unchanged limit is left alone, so it keeps counting.
   */
  async setForApiKey(params: SetForApiKeyParams) {
    const apply = await this.prepareSetForApiKey(params);
    await apply();
  }

  /**
   * Runs the checks of `setForApiKey` and returns the write, so a caller can
   * refuse a request before changing anything else.
   */
  async prepareSetForApiKey(
    params: SetForApiKeyParams,
  ): Promise<() => Promise<void>> {
    const change = await this.prepareChange({
      ...params,
      scope: { type: "API_KEY", apiKeyId: params.apiKeyId },
    });
    return () => this.applyChanges([change]);
  }

  /**
   * Writes all changes in one transaction, so a refused write leaves every
   * limit as it was, then drops the gateway's cached contexts they affect.
   */
  private async applyChanges(changes: SpendLimitChange[]) {
    // A change to every matching key or user can write hundreds of limits and audit logs.
    await this.prisma.$transaction(
      async (tx) => {
        for (const change of changes) await change.write(tx);
      },
      { timeout: BULK_WRITE_TIMEOUT_MS },
    );
    for (const change of changes) await change.invalidateResolveCache();
  }

  /**
   * Makes `limit` the scope's only spend limit, or removes all of them when it
   * is null, after checking the caller may.
   */
  private async prepareChange(params: {
    organizationId: string;
    usageScope: GatewayUsageScope;
    scope: GatewaySpendLimitScope;
    limit: SpendLimitInput | null;
    session: OrgAuthedContext["session"];
  }): Promise<SpendLimitChange> {
    const { limit, organizationId, session, scope } = params;
    const subject = await this.requireSubject(params);
    const existing = await this.repository.list({ organizationId, scope });
    const kept = limit
      ? existing.find((candidate) => candidate.interval === limit.interval)
      : undefined;
    const { alertThresholds: normalizedThresholds, isUnchanged } =
      resolveSpendLimitChange(kept, limit);
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
    // A key's own budget replaces the default, so adding one would lift the admin's cap.
    if (
      ownerUserId !== undefined &&
      limit &&
      existing.length === 0 &&
      scope.type === "API_KEY" &&
      (await this.repository.findDefault({ organizationId, scope: "API_KEY" }))
    ) {
      throw new ForbiddenError(
        "This key has the organization's default budget, so only a gateway admin can change it.",
      );
    }
    if (limit && !isUnchanged) {
      await this.requireRecordingProjectId(organizationId);
    }

    const changesLimits = changed.length > 0 || (limit !== null && !kept);
    return {
      write: async (tx) => {
        if (limit && !kept) {
          await create(tx, {
            organizationId,
            scope,
            interval: limit.interval,
            limitUsd: limit.limitUsd,
            alertThresholds: normalizedThresholds!,
            session,
          });
        } else if (limit && kept && !isUnchanged) {
          await update(tx, {
            before: kept,
            limitUsd: limit.limitUsd,
            alertThresholds: normalizedThresholds!,
            session,
          });
        }
        for (const candidate of existing) {
          if (candidate !== kept) {
            await remove(tx, { before: candidate, session });
          }
        }
      },
      invalidateResolveCache: async () => {
        if (changesLimits) await subject.invalidateResolveCache();
      },
    };
  }

  /**
   * The organization's default budget for keys and for users, each applying to
   * every key or user without a budget of its own.
   */
  async getDefaults(organizationId: string) {
    const defaults = await this.repository.listDefaults(organizationId);
    const toBudget = (scope: GatewaySpendLimitScope["type"]) => {
      const limit = defaults.find(
        (candidate) =>
          candidate.scope === GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES[scope],
      );
      return limit ? toGatewaySpendLimitDto(limit) : null;
    };
    return { API_KEY: toBudget("API_KEY"), USER: toBudget("USER") };
  }

  /**
   * Makes `limit` the organization's default budget for keys or users, or
   * removes it when null. Every key of the organization may resolve it.
   */
  async setDefault(params: {
    organizationId: string;
    scope: GatewaySpendLimitScope["type"];
    limit: SpendLimitInput | null;
    session: OrgAuthedContext["session"];
  }) {
    await this.setSubjectless({
      ...params,
      scope: GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES[params.scope],
      conflictMessage:
        "The default budget was changed at the same time. Reload and try again.",
    });
  }

  /**
   * The organization's own budget, which caps all of its gateway spend on top
   * of key and user budgets, with what ClickHouse has recorded against it in
   * its current window; `spentUsd` is absent while spend is not recorded.
   */
  async getOrganizationBudget(organizationId: string) {
    const limit = await this.repository.findSubjectless({
      organizationId,
      scope: GATEWAY_ORGANIZATION_SPEND_LIMIT_SCOPE,
    });
    if (!limit) return null;
    const recordingProjectId = await this.getRecordingProjectId(organizationId);
    // The budget stays visible and editable while its spend can't be read.
    const spentUsd = recordingProjectId
      ? await readSpend(recordingProjectId, "ORGANIZATION", [
          { subjectId: recordingProjectId, limit },
        ]).then(
          (spend) => spend.get(recordingProjectId) ?? 0,
          (error: unknown) => {
            logger.warn("Failed to read the organization's gateway spend", {
              organizationId,
              error,
            });
            return undefined;
          },
        )
      : undefined;
    return {
      spendLimit: toGatewaySpendLimitDto(limit),
      spentUsd,
    };
  }

  /** Makes `limit` the organization's own budget, or removes it when null. */
  async setOrganizationBudget(params: {
    organizationId: string;
    limit: SpendLimitInput | null;
    session: OrgAuthedContext["session"];
  }) {
    await this.setSubjectless({
      ...params,
      scope: GATEWAY_ORGANIZATION_SPEND_LIMIT_SCOPE,
      conflictMessage:
        "The organization budget was changed at the same time. Reload and try again.",
    });
  }

  /**
   * Makes `limit` the organization's one limit of a scope without a subject,
   * or removes it when null. Like a budget of one key or user, an unchanged
   * limit keeps counting, a new amount keeps counting and a new interval
   * starts counting afresh. Every key of the organization may resolve it, so
   * all of them are dropped from the resolve cache.
   */
  private async setSubjectless(params: {
    organizationId: string;
    scope: GatewaySubjectlessSpendLimitScope;
    limit: SpendLimitInput | null;
    session: OrgAuthedContext["session"];
    conflictMessage: string;
  }) {
    const { organizationId, scope, limit, session } = params;
    const existing = await this.repository.findSubjectless({
      organizationId,
      scope,
    });
    const kept = existing?.interval === limit?.interval ? existing : null;
    const { alertThresholds: normalizedThresholds, isUnchanged } =
      resolveSpendLimitChange(kept, limit);
    if (isUnchanged) return;
    if (!limit && !existing) return;
    if (limit) await this.requireRecordingProjectId(organizationId);

    // One limit per scope, so a replaced one goes first, in the same
    // transaction so that a failed write keeps it.
    try {
      await this.prisma.$transaction(async (tx) => {
        if (kept && limit) {
          await update(tx, {
            before: kept,
            limitUsd: limit.limitUsd,
            alertThresholds: normalizedThresholds!,
            session,
          });
          return;
        }
        if (existing) await remove(tx, { before: existing, session });
        if (limit) {
          await createSubjectless(tx, {
            organizationId,
            scope,
            interval: limit.interval,
            limitUsd: limit.limitUsd,
            alertThresholds: normalizedThresholds!,
            session,
          });
        }
      });
    } catch (error) {
      // Another save of the same limit won: one created it (P2002) or removed the replaced one (P2025).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2025")
      ) {
        throw new LangfuseConflictError(params.conflictMessage);
      }
      throw error;
    }
    await invalidateGatewayResolveCacheForOrganization(organizationId);
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
}

/**
 * What ClickHouse has recorded against each budget in its current window,
 * counted from when the budget was set if that is later.
 */
async function readSpend(
  projectId: string,
  scope: Parameters<typeof getGatewaySpendSinceFromEvents>[0]["scope"],
  budgeted: {
    subjectId: string;
    limit: Pick<GatewaySpendLimitRecord, "interval" | "countingStartedAt">;
  }[],
) {
  const now = new Date();
  const spend = await getGatewaySpendSinceFromEvents({
    projectId,
    scope,
    subjects: budgeted.map(({ subjectId, limit }) => ({
      id: subjectId,
      since: new Date(
        Math.max(
          getGatewaySpendLimitWindowStart(limit.interval, now).getTime(),
          limit.countingStartedAt.getTime(),
        ),
      ),
    })),
  });
  return new Map(spend.map(({ id, spendUsd }) => [id, spendUsd]));
}

async function create(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    scope: GatewaySpendLimitScope;
    interval: GatewaySpendLimitInterval;
    limitUsd: number;
    alertThresholds: GatewaySpendBudgetAlertThreshold[];
    session: OrgAuthedContext["session"];
  },
) {
  let limit: GatewaySpendLimitRecord;
  try {
    limit = await new GatewaySpendLimitRepository(tx).create({
      organizationId: params.organizationId,
      scope: params.scope,
      interval: params.interval,
      limitUsd: params.limitUsd,
      alertThresholds: params.alertThresholds,
      countingStartedAt: new Date(),
      ownerUserId: params.session.user.id,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new LangfuseConflictError(
        "A budget for this interval already exists",
      );
    }
    throw error;
  }
  await audit(tx, { session: params.session, action: "create", after: limit });
}

async function createSubjectless(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    scope: GatewaySubjectlessSpendLimitScope;
    interval: GatewaySpendLimitInterval;
    limitUsd: number;
    alertThresholds: GatewaySpendBudgetAlertThreshold[];
    session: OrgAuthedContext["session"];
  },
) {
  const limit = await new GatewaySpendLimitRepository(tx).createSubjectless({
    organizationId: params.organizationId,
    scope: params.scope,
    interval: params.interval,
    limitUsd: params.limitUsd,
    alertThresholds: params.alertThresholds,
    countingStartedAt: new Date(),
    ownerUserId: params.session.user.id,
  });
  await audit(tx, { session: params.session, action: "create", after: limit });
}

async function update(
  tx: Prisma.TransactionClient,
  params: {
    before: GatewaySpendLimitRecord;
    limitUsd: number;
    alertThresholds: GatewaySpendBudgetAlertThreshold[];
    session: OrgAuthedContext["session"];
  },
) {
  const after = await new GatewaySpendLimitRepository(tx).updateLimit({
    id: params.before.id,
    limitUsd: params.limitUsd,
    alertThresholds: params.alertThresholds,
    clearAlerts: params.before.limitUsd.toNumber() !== params.limitUsd,
    userId: params.session.user.id,
  });
  await audit(tx, {
    session: params.session,
    action: "update",
    before: params.before,
    after,
  });
}

function resolveSpendLimitChange(
  kept: GatewaySpendLimitRecord | null | undefined,
  limit: SpendLimitInput | null,
) {
  if (!limit) {
    return { alertThresholds: undefined, isUnchanged: false };
  }
  const alertThresholds = normalizeGatewaySpendBudgetAlertThresholds(
    limit.alertThresholds ??
      kept?.alertThresholds ??
      DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS,
  );
  const isUnchanged =
    kept != null &&
    kept.limitUsd.toNumber() === limit.limitUsd &&
    areGatewaySpendBudgetAlertThresholdsEqual(
      kept.alertThresholds,
      alertThresholds,
    );
  return { alertThresholds, isUnchanged };
}

/** Deleting stays possible without ingestion, so a limit can always be removed. */
async function remove(
  tx: Prisma.TransactionClient,
  params: {
    before: GatewaySpendLimitRecord;
    session: OrgAuthedContext["session"];
  },
) {
  await new GatewaySpendLimitRepository(tx).delete({ id: params.before.id });
  await audit(tx, {
    session: params.session,
    action: "delete",
    before: params.before,
  });
}

function nextCountingStartedAt(previous: Date, now: Date) {
  return new Date(Math.max(now.getTime(), previous.getTime() + 1));
}

function audit(
  tx: Prisma.TransactionClient,
  params: {
    session: OrgAuthedContext["session"];
    action: "create" | "update" | "delete" | "reset";
    before?: GatewaySpendLimitRecord;
    after?: GatewaySpendLimitRecord;
  },
) {
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
    tx,
  );
}

/** A checked change to one scope's limits, written later together with others. */
type SpendLimitChange = {
  write: (tx: Prisma.TransactionClient) => Promise<void>;
  invalidateResolveCache: () => Promise<void>;
};

/**
 * Which keys or users a status lists, by whether they have a budget of their
 * own; null when it lists none. With a default, every key or user has a
 * budget, so none is unlimited and every one may be exceeded.
 */
function toBudgetFilter(status: GatewayBudgetStatus, hasDefault: boolean) {
  switch (status) {
    case "all":
      return "any";
    case "budgeted":
      return "with";
    case "default":
      return hasDefault ? "without" : null;
    case "unlimited":
      return hasDefault ? null : "without";
    case "exceeded":
      return hasDefault ? "any" : "with";
  }
}
