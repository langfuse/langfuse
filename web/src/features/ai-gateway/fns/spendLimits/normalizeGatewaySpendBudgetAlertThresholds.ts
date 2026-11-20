import {
  GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS,
  type GatewaySpendBudgetAlertThreshold,
} from "@/src/features/ai-gateway/constants/gatewaySpendBudgetAlertThresholds";

/** Keeps only supported alert thresholds, deduplicated in ascending order. */
export function normalizeGatewaySpendBudgetAlertThresholds(
  thresholds: readonly number[],
): GatewaySpendBudgetAlertThreshold[] {
  const selected = new Set(thresholds);
  return GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS.filter((threshold) =>
    selected.has(threshold),
  );
}
