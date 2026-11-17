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
} from "@langfuse/shared/src/server";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { getGatewaySpendLimitWindowStart } from "./gatewaySpendLimitWindow";
import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";
import { invalidateGatewayResolveCacheForApiKey } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
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

type SetForApiKeyParams = {
  organizationId: string;
  usageScope: GatewayUsageScope;
  apiKeyId: string;
  limit: { interval: GatewaySpendLimitInterval; limitUsd: number } | null;
  session: OrgAuthedContext["session"];
};

/**
 * Gateway spend limits, each capping one scope (today: an API key, set
 * together with the key). Spend is read from the gateway ingestion project, so
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
  async prepareSetForApiKey(
    params: SetForApiKeyParams,
  ): Promise<() => Promise<void>> {
    const { limit, organizationId, session } = params;
    const scope = { type: "API_KEY", apiKeyId: params.apiKeyId } as const;
    const subject = await this.requireSubject({ ...params, scope });
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
    // A total limit's window starts at the epoch, so the subject's creation bounds the scan.
    const [baselineSpendUsd] = await getScopeSpendSince({
      projectId: params.recordingProjectId,
      scope: params.scope,
      since: [
        new Date(
          Math.max(windowStart.getTime(), params.subjectCreatedAt.getTime()),
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
  }
}
