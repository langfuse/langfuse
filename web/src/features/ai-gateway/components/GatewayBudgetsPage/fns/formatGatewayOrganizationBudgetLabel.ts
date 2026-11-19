import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";
import { usdFormatter } from "@/src/utils/numbers";

const intervalLabels: Record<GatewaySpendBudgetInterval, string> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  TOTAL: "total",
};

/** The organization budget button's label: spend and budget, or how to set one. */
export function formatGatewayOrganizationBudgetLabel(
  budget:
    | { spendLimit: GatewaySpendLimit; spentUsd: number | undefined }
    | null
    | undefined,
) {
  if (!budget) return "Set organization budget";
  const { interval, limitUsd } = budget.spendLimit;
  const limit = `${formatUsd(limitUsd)} ${intervalLabels[interval]}`;
  if (budget.spentUsd === undefined) return `Organization: ${limit}`;
  return `Organization: ${formatUsd(budget.spentUsd)} / ${limit}`;
}

function formatUsd(value: number) {
  return usdFormatter(value, 0, 2);
}
