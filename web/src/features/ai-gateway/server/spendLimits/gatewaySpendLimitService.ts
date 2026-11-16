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
import { getGatewayApiKeySpendSince } from "./gatewayApiKeySpendRepository";
import {
  GatewaySpendLimitRepository,
  type GatewaySpendLimitRecord,
} from "./gatewaySpendLimitRepository";

const GATEWAY_SPEND_LIMITS_UNAVAILABLE_REASON =
  "Please switch to ingestion mode usage to enable this";

/**
 * Spend limits for gateway keys. Spend is read from the gateway ingestion
 * project, so limits are only available while gateway requests are recorded.
 * Every write drops the key's cached /resolve context, so the gateway sees the
 * change on the key's next request.
 */
export class GatewaySpendLimitService {
  private readonly repository: GatewaySpendLimitRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new GatewaySpendLimitRepository(prisma);
  }

  /**
   * The key's limits with what ClickHouse has recorded for each current
   * window. The gateway enforces against its own counters, which run ahead of
   * ClickHouse by the ingestion delay.
   */
  async list(params: {
    organizationId: string;
    ownerUserId?: string;
    apiKeyId: string;
  }) {
    const apiKey = await this.requireApiKey(params);
    const recordingProjectId = await this.getRecordingProjectId(
      params.organizationId,
    );
    const limits = await this.repository.listForApiKey(params);
    const now = new Date();
    const windowStarts = limits.map((limit) =>
      getGatewaySpendLimitWindowStart(limit.interval, now),
    );
    const spend =
      recordingProjectId && limits.length > 0
        ? await getGatewayApiKeySpendSince({
            projectId: recordingProjectId,
            apiKeyId: apiKey.id,
            since: limits.map((limit, index) =>
              spendSince({
                // A lifetime limit's baseline holds the spend before the limit
                // existed, so only spend since then is read on every list.
                windowStart:
                  limit.interval === "LIFETIME"
                    ? limit.createdAt
                    : windowStarts[index]!,
                apiKeyCreatedAt: apiKey.createdAt,
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
              (limit.interval === "LIFETIME"
                ? limit.baselineSpendUsd.toNumber()
                : 0),
      })),
    };
  }

  async create(params: {
    organizationId: string;
    apiKeyId: string;
    interval: GatewaySpendLimitInterval;
    limitUsd: number;
    session: OrgAuthedContext["session"];
  }) {
    const apiKey = await this.requireApiKey(params);
    const recordingProjectId = await this.requireRecordingProjectId(
      params.organizationId,
    );
    const windowStart = getGatewaySpendLimitWindowStart(params.interval);
    const [baselineSpendUsd] = await getGatewayApiKeySpendSince({
      projectId: recordingProjectId,
      apiKeyId: apiKey.id,
      since: [spendSince({ windowStart, apiKeyCreatedAt: apiKey.createdAt })],
    });
    let limit: GatewaySpendLimitRecord;
    try {
      limit = await this.repository.create({
        organizationId: params.organizationId,
        apiKeyId: apiKey.id,
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
          "This key already has a spend limit for this interval",
        );
      }
      throw error;
    }
    await this.invalidate(apiKey.fastHashedSecretKey);
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
    const { before, apiKey } = await this.requireLimit(params);
    await this.requireRecordingProjectId(params.organizationId);
    const after = await this.repository.updateLimit(params);
    await this.invalidate(apiKey.fastHashedSecretKey);
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
    const { before, apiKey } = await this.requireLimit(params);
    await this.requireRecordingProjectId(params.organizationId);
    const after = await this.repository.reset({
      id: before.id,
      windowStart: getGatewaySpendLimitWindowStart(before.interval),
      resetAt: new Date(),
    });
    await this.invalidate(apiKey.fastHashedSecretKey);
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
    const { before, apiKey } = await this.requireLimit(params);
    await this.repository.delete({ id: before.id });
    await this.invalidate(apiKey.fastHashedSecretKey);
    await this.audit({ session: params.session, action: "delete", before });
  }

  private async requireApiKey(params: {
    organizationId: string;
    ownerUserId?: string;
    apiKeyId: string;
  }) {
    const apiKey = await this.repository.getGatewayApiKey(params);
    if (!apiKey) throw new LangfuseNotFoundError("Gateway key not found");
    return apiKey;
  }

  private async requireLimit(params: { organizationId: string; id: string }) {
    const before = await this.repository.get(params);
    if (!before) throw new LangfuseNotFoundError("Spend limit not found");
    const apiKey = await this.requireApiKey({
      organizationId: params.organizationId,
      apiKeyId: before.apiKeyId,
    });
    return { before, apiKey };
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

  private async invalidate(fastHashedSecretKey: string | null) {
    if (fastHashedSecretKey) {
      await invalidateGatewayResolveCacheForApiKey(fastHashedSecretKey);
    }
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

/** Spend counts from the window start, but never from before the key existed or was last reset. */
function spendSince(params: {
  windowStart: Date;
  apiKeyCreatedAt: Date;
  resetAt?: Date | null;
}) {
  return new Date(
    Math.max(
      params.windowStart.getTime(),
      params.apiKeyCreatedAt.getTime(),
      params.resetAt?.getTime() ?? 0,
    ),
  );
}

function toGatewaySpendLimit(limit: GatewaySpendLimitRecord) {
  return {
    id: limit.id,
    apiKeyId: limit.apiKeyId,
    interval: limit.interval,
    limitUsd: limit.limitUsd.toNumber(),
    generation: limit.generation,
    resetAt: limit.resetAt,
    createdAt: limit.createdAt,
    updatedAt: limit.updatedAt,
  };
}
