/** Which keys or users the Budgets page lists, by their budget. */
export const GATEWAY_BUDGET_STATUSES = [
  "all",
  "budgeted",
  "default",
  "unlimited",
  "exceeded",
] as const;

export type GatewayBudgetStatus = (typeof GATEWAY_BUDGET_STATUSES)[number];
