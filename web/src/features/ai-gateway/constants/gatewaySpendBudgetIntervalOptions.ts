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

/** How many keys or users one budget change may apply to, as on the server. */
export const GATEWAY_SPEND_BUDGET_MAX_SUBJECTS = 100;

/** How many keys or users one change to everything matching the table's filter may apply to. */
export const GATEWAY_SPEND_BUDGET_MAX_MATCHING_SUBJECTS = 1_000;
