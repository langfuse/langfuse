import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";

/** The tab of the organization's own budgets, which cap all of its gateway spend. */
export const GATEWAY_ORGANIZATION_BUDGETS_TAB = {
  value: "organization",
  label: "Organization",
} as const;

/** The Budgets page tabs: the per-key and per-user spend tabs and the organization's. */
export type GatewayBudgetsTab =
  | GatewaySpendTab
  | typeof GATEWAY_ORGANIZATION_BUDGETS_TAB.value;
