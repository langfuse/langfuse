import { DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetAlertThresholds";
import { createDefaultGatewaySpendBudget } from "@/src/features/ai-gateway/fns/spendLimits/createDefaultGatewaySpendBudget";
import { normalizeGatewaySpendBudgetAlertThresholds } from "@/src/features/ai-gateway/fns/spendLimits/normalizeGatewaySpendBudgetAlertThresholds";
import type { GatewaySpendBudgetFormValue } from "@/src/features/ai-gateway/types/gatewaySpendBudgetFormSchema";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";

/** A budget's form value, or the default empty one when there is no budget. */
export function toGatewaySpendBudgetFormValue(
  spendLimit: GatewaySpendLimit | null,
): GatewaySpendBudgetFormValue {
  if (!spendLimit) return createDefaultGatewaySpendBudget();
  return {
    interval: spendLimit.interval,
    limitUsd: String(spendLimit.limitUsd),
    alertThresholds: normalizeGatewaySpendBudgetAlertThresholds(
      spendLimit.alertThresholds ??
        DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS,
    ),
  };
}

/** A checked form value as the budget the API takes. */
export function toGatewaySpendLimit(
  value: GatewaySpendBudgetFormValue,
): GatewaySpendLimit {
  return {
    interval: value.interval,
    limitUsd: Number(value.limitUsd.trim()),
    alertThresholds: normalizeGatewaySpendBudgetAlertThresholds(
      value.alertThresholds,
    ),
  };
}
