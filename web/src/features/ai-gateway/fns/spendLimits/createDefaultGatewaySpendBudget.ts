import { DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetAlertThresholds";
import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import type { GatewaySpendBudgetFormValue } from "@/src/features/ai-gateway/types/gatewaySpendBudgetFormSchema";

/** A new spend budget form value with default alert thresholds. */
export function createDefaultGatewaySpendBudget(
  interval: GatewaySpendBudgetInterval = "DAILY",
): GatewaySpendBudgetFormValue {
  return {
    interval,
    limitUsd: "",
    alertThresholds: [...DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS],
  };
}
