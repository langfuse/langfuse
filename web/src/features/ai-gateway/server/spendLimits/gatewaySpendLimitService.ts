import {
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import {
  Prisma,
  type GatewaySpendLimitInterval,
  type PrismaClient,
} from "@langfuse/shared/src/db";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { getGatewaySpendLimitWindowStart } from "@/src/features/ai-gateway/fns/getGatewaySpendLimitWindowStart";
import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";
import { invalidateGatewayResolveCacheForApiKey } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { getGatewaySpendSince } from "./gatewaySpendRepository";
import {
  GatewaySpendLimitRepository,
  type GatewaySpendLimitRecord,
} from "./gatewaySpendLimitRepository";
import {
  type GatewaySpendLimitScope,
  toGatewaySpendLimitScope,
} from "./gatewaySpendLimitScope";

const GATEWAY_SPEND_LIMITS_UNAVAILABLE_REASON =
  "Please switch to ingestion mode usage to enable this";

/**
 * Gateway spend limits, each capping one scope (today: an API key). Spend is
 * read from the gateway ingestion project, so limits are only available while
 * gateway requests are recorded. Every write drops the cached /resolve context
 * of the keys the scope covers, so the gateway sees the change on their next
 * request.
 */
export class GatewaySpendLimitService {
  private readonly repository: GatewaySpendLimitRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new GatewaySpendLimitRepository(prisma);
  }

  /**
   * The scope's limits with what ClickHouse has recorded for each current
   * window. The gateway enforces against its own counters, which run ahead of
   * ClickHouse by the ingestion delay.
   */
  async list(params: {
    organizationId: string;
    ownerUserId?: string;
    scope: GatewaySpendLimitScope;
  }) {
    const subject = await this.requireSubject(params);
    const recordingProjectId = await this.getRecordingProjectId(
      params.organizationId,
    );
    const limits = await this.repository.list(params);
    const now = new Date();
    const windowStarts = limits.map((limit) =>
      getGatewaySpendLimitWindowStart(limit.interval, now),
    );
    const spend =
      recordingProjectId && limits.length > 0
        ? await getGatewaySpendSince({
            projectId: recordingProjectId,
            scope: params.scope,
            since: limits.map((limit, index) =>
              spendSince({
                // A total limit's baseline holds the spend before the limit
                // existed, so only spend since then is read on every list.
                windowStart:
                  limit.interval === "TOTAL"
                    ? limit.createdAt
                    : windowStarts[index]!,
                subjectCreatedAt: subject.createdAt,
                resetAt: limit.resetAt,
              }),
            ),
          })
        : null;
    return {
      available: recordingProjectId !== null,
      unavailableReason:
        recordingProjectId === null
          ? GATEWAY_SPEND_LIMITS_UNAVAILABLE_REASON
          : null,
      limits: limits.map((limit, index) => ({
        ...toGatewaySpendLimit(limit),
        windowStart: windowStarts[index]!,
        recordedSpendUsd:
          spend === null
            ? null
            : spend[index]! +
              (limit.interval === "TOTAL"
                ? limit.baselineSpendUsd.toNumber()
                : 0),
      })),
    };
  }

  async create(params: {
    organizationId: string;
    scope: GatewaySpendLimitScope;
    interval: GatewaySpendLimitInterval;
    limitUsd: number;
    session: OrgAuthedContext["session"];
  }) {
    const subject = await this.requireSubject(params);
    const recordingProjectId = await this.requireRecordingProjectId(
      params.organizationId,
    );
    const windowStart = getGatewaySpendLimitWindowStart(params.interval);
    const [baselineSpendUsd] = await getGatewaySpendSince({
      projectId: recordingProjectId,
      scope: params.scope,
      since: [spendSince({ windowStart, subjectCreatedAt: subject.createdAt })],
    });
    let limit: GatewaySpendLimitRecord;
    try {
      limit = await this.repository.create({
        organizationId: params.organizationId,
        scope: params.scope,
        interval: params.interval,
        limitUsd: params.limitUsd,
        baselineSpendUsd: baselineSpendUsd ?? 0,
        baselineWindowStart: windowStart,
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
    await subject.invalidateResolveCache();
    await this.audit({
      session: params.session,
      action: "create",
      after: limit,
    });
    return toGatewaySpendLimit(limit);
  }

  async update(params: {
    organizationId: string;
    id: string;
    limitUsd: number;
    session: OrgAuthedContext["session"];
  }) {
    const { before, subject } = await this.requireLimit(params);
    await this.requireRecordingProjectId(params.organizationId);
    const after = await this.repository.updateLimit(params);
    await subject.invalidateResolveCache();
    await this.audit({
      session: params.session,
      action: "update",
      before,
      after,
    });
    return toGatewaySpendLimit(after);
  }

  /** Starts the current window over at zero spend, for the gateway and for the recorded spend shown. */
  async reset(params: {
    organizationId: string;
    id: string;
    session: OrgAuthedContext["session"];
  }) {
    const { before, subject } = await this.requireLimit(params);
    await this.requireRecordingProjectId(params.organizationId);
    const after = await this.repository.reset({
      id: before.id,
      windowStart: getGatewaySpendLimitWindowStart(before.interval),
      resetAt: new Date(),
    });
    await subject.invalidateResolveCache();
    await this.audit({
      session: params.session,
      action: "reset",
      before,
      after,
    });
    return toGatewaySpendLimit(after);
  }

  /** Deleting stays possible without ingestion, so a limit can always be removed. */
  async delete(params: {
    organizationId: string;
    id: string;
    session: OrgAuthedContext["session"];
  }) {
    const { before, subject } = await this.requireLimit(params);
    await this.repository.delete({ id: before.id });
    await subject.invalidateResolveCache();
    await this.audit({ session: params.session, action: "delete", before });
  }

  /** What the scope applies to, if the caller may see it. */
  private async requireSubject(params: {
    organizationId: string;
    ownerUserId?: string;
    scope: GatewaySpendLimitScope;
  }) {
    switch (params.scope.type) {
      case "API_KEY": {
        const apiKey = await this.repository.getGatewayApiKey({
          organizationId: params.organizationId,
          ownerUserId: params.ownerUserId,
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

  private async requireLimit(params: { organizationId: string; id: string }) {
    const before = await this.repository.get(params);
    if (!before) throw new LangfuseNotFoundError("Spend limit not found");
    const subject = await this.requireSubject({
      organizationId: params.organizationId,
      scope: toGatewaySpendLimitScope(before),
    });
    return { before, subject };
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
    action: "create" | "update" | "reset" | "delete";
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

/** Spend counts from the window start, but never from before the subject existed or the limit was last reset. */
function spendSince(params: {
  windowStart: Date;
  subjectCreatedAt: Date;
  resetAt?: Date | null;
}) {
  return new Date(
    Math.max(
      params.windowStart.getTime(),
      params.subjectCreatedAt.getTime(),
      params.resetAt?.getTime() ?? 0,
    ),
  );
}

function toGatewaySpendLimit(limit: GatewaySpendLimitRecord) {
  return {
    id: limit.id,
    scope: toGatewaySpendLimitScope(limit),
    interval: limit.interval,
    limitUsd: limit.limitUsd.toNumber(),
    generation: limit.generation,
    resetAt: limit.resetAt,
    createdAt: limit.createdAt,
    updatedAt: limit.updatedAt,
  };
}
