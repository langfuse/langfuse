import type {
  GatewaySpendLimitInterval,
  Prisma,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { orgBoundApiKeyScopes } from "@langfuse/shared/src/server/auth/apiKeys";

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
  baselineSpendUsd: true,
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

  /** The gateway key, if it is in the organization and, with ownerUserId, owned by that user. */
  getGatewayApiKey(params: {
    organizationId: string;
    ownerUserId?: string;
    apiKeyId: string;
  }) {
    return this.prisma.apiKey.findFirst({
      where: {
        id: params.apiKeyId,
        orgId: params.organizationId,
        scope: { in: orgBoundApiKeyScopes },
        gatewayAssociation: { isNot: null },
        ...(params.ownerUserId !== undefined && {
          userId: params.ownerUserId,
        }),
      },
      select: { id: true, createdAt: true, fastHashedSecretKey: true },
    });
  }

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

  /** The limit, if it is in the organization and, with ownerUserId, owned by that user. */
  get(params: { organizationId: string; id: string; ownerUserId?: string }) {
    return this.prisma.gatewaySpendLimit.findFirst({
      where: {
        id: params.id,
        organizationId: params.organizationId,
        ...(params.ownerUserId !== undefined && {
          ownerUserId: params.ownerUserId,
        }),
      },
      select: GATEWAY_SPEND_LIMIT_SELECT,
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
    baselineSpendUsd: number;
    ownerUserId: string;
  }) {
    return this.prisma.gatewaySpendLimit.create({
      data: { ...params, ...toScopeColumns(scope) },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  updateLimit(params: { id: string; limitUsd: number; userId: string }) {
    return this.prisma.gatewaySpendLimit.update({
      where: { id: params.id },
      data: { limitUsd: params.limitUsd, ownerUserId: params.userId },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  /** A new counting start puts the gateway on fresh usage counters, so the baseline is dropped too. */
  reset(params: { id: string; countingStartedAt: Date; userId: string }) {
    return this.prisma.gatewaySpendLimit.update({
      where: { id: params.id },
      data: {
        countingStartedAt: params.countingStartedAt,
        baselineSpendUsd: 0,
        ownerUserId: params.userId,
      },
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
