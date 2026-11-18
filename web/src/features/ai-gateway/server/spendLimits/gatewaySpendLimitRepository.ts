import type {
  GatewaySpendLimitInterval,
  Prisma,
  PrismaClient,
} from "@langfuse/shared/src/db";
import {
  type GatewaySpendLimitScope,
  toScopeColumns,
} from "./gatewaySpendLimitScope";

const GATEWAY_SPEND_LIMIT_SELECT = {
  id: true,
  scope: true,
  apiKeyId: true,
  interval: true,
  limitUsd: true,
  countingStartedAt: true,
  ownerUserId: true,
  createdAt: true,
  updatedAt: true,
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
