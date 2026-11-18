export const gatewaySpendBudgetIntervalOptions = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "TOTAL", label: "Never" },
] as const;

export type GatewaySpendBudgetInterval =
  (typeof gatewaySpendBudgetIntervalOptions)[number]["value"];

/** Matches the server's limit, so the form rejects what the API would. */
export const GATEWAY_SPEND_BUDGET_MAX_USD = 1_000_000_000;
