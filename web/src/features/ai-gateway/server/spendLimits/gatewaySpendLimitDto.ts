import type {
  GatewaySpendLimitInterval,
  Prisma,
} from "@langfuse/shared/src/db";

import { normalizeGatewaySpendBudgetAlertThresholds } from "@/src/features/ai-gateway/fns/spendLimits/normalizeGatewaySpendBudgetAlertThresholds";

/** Fields serialized to clients for a spend budget. */
export const GATEWAY_SPEND_LIMIT_DTO_SELECT = {
  interval: true,
  limitUsd: true,
  alertThresholds: true,
} as const;

/** Maps a stored spend limit row to the client-facing budget shape. */
export function toGatewaySpendLimitDto(limit: {
  interval: GatewaySpendLimitInterval;
  limitUsd: Prisma.Decimal;
  alertThresholds: number[];
}) {
  return {
    interval: limit.interval,
    limitUsd: limit.limitUsd.toNumber(),
    alertThresholds: normalizeGatewaySpendBudgetAlertThresholds(
      limit.alertThresholds,
    ),
  };
}
