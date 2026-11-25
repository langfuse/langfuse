/** Supported budget usage percentages that can trigger email alerts, in ascending order. */
export const GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS = [85, 95, 100] as const;

export type GatewaySpendBudgetAlertThreshold =
  (typeof GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS)[number];

/** Default alert thresholds when configuring a new budget. */
export const DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS: readonly GatewaySpendBudgetAlertThreshold[] =
  [100];
