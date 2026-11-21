import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { formatGatewayBudgetUsd } from "@/src/features/ai-gateway/fns/formatGatewayBudgetUsd";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";

const intervalLabels: Record<GatewaySpendBudgetInterval, string> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  TOTAL: "total",
};

/** A budget as its amount and interval, e.g. "$10 monthly". */
export function formatGatewaySpendBudget({
  interval,
  limitUsd,
}: GatewaySpendLimit) {
  return `${formatGatewayBudgetUsd(limitUsd)} ${intervalLabels[interval]}`;
}
