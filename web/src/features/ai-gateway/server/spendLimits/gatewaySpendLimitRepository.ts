import type {
  GatewaySpendLimitInterval,
  Prisma,
  PrismaClient,
} from "@langfuse/shared/src/db";
import { orgBoundApiKeyScopes } from "@langfuse/shared/src/server/auth/apiKeys";

const GATEWAY_SPEND_LIMIT_SELECT = {
  id: true,
  apiKeyId: true,
  interval: true,
  limitUsd: true,
  generation: true,
  resetAt: true,
  baselineSpendUsd: true,
  baselineWindowStart: true,
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

  listForApiKey(params: { organizationId: string; apiKeyId: string }) {
    return this.prisma.gatewaySpendLimit.findMany({
      where: {
        organizationId: params.organizationId,
        apiKeyId: params.apiKeyId,
      },
      select: GATEWAY_SPEND_LIMIT_SELECT,
      orderBy: { createdAt: "asc" },
    });
  }

  get(params: { organizationId: string; id: string }) {
    return this.prisma.gatewaySpendLimit.findFirst({
      where: { id: params.id, organizationId: params.organizationId },
      select: GATEWAY_SPEND_LIMIT_SELECT,
    });
  }

  create(params: {
    organizationId: string;
    apiKeyId: string;
    interval: GatewaySpendLimitInterval;
    limitUsd: number;
    baselineSpendUsd: number;
    baselineWindowStart: Date;
  }) {
    return this.prisma.gatewaySpendLimit.create({
      data: params,
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
