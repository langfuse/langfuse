import type { GatewaySpendLimit } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayBudgets";
import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { usdFormatter } from "@/src/utils/numbers";

const intervalLabels: Record<GatewaySpendBudgetInterval, string> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  TOTAL: "total",
};

/** The default budget button's label: the default, or how to set one. */
export function formatGatewayDefaultBudgetLabel(
  defaultBudget: GatewaySpendLimit | null | undefined,
) {
  if (!defaultBudget) return "Set default budget";
  return `Default: ${usdFormatter(defaultBudget.limitUsd, 0, 2)} ${intervalLabels[defaultBudget.interval]}`;
}
