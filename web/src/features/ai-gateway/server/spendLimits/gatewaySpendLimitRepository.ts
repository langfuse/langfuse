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
  generation: true,
  resetAt: true,
  baselineSpendUsd: true,
  baselineWindowStart: true,
  createdByUserId: true,
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

  /** The limit, if it is in the organization and, with createdByUserId, created by that user. */
  get(params: {
    organizationId: string;
    id: string;
    createdByUserId?: string;
  }) {
    return this.prisma.gatewaySpendLimit.findFirst({
      where: {
        id: params.id,
        organizationId: params.organizationId,
        ...(params.createdByUserId !== undefined && {
          createdByUserId: params.createdByUserId,
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
    baselineSpendUsd: number;
    baselineWindowStart: Date;
    createdByUserId: string;
  }) {
    return this.prisma.gatewaySpendLimit.create({
      data: { ...params, ...toScopeColumns(scope) },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  updateLimit(params: { id: string; limitUsd: number }) {
    return this.prisma.gatewaySpendLimit.update({
      where: { id: params.id },
      data: { limitUsd: params.limitUsd },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  /** A new generation starts the gateway on fresh usage counters, so the baseline is dropped too. */
  reset(params: { id: string; windowStart: Date; resetAt: Date }) {
    return this.prisma.gatewaySpendLimit.update({
      where: { id: params.id },
      data: {
        generation: { increment: 1 },
        resetAt: params.resetAt,
        baselineSpendUsd: 0,
        baselineWindowStart: params.windowStart,
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
