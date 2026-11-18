import { useRouter } from "next/router";

import {
  GATEWAY_ORGANIZATION_BUDGETS_TAB,
  type GatewayBudgetsTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewayBudgetsTabs";

/**
 * The Budgets page tab, kept in the `tab` query parameter. Only gateway
 * managers see user and organization budgets, so everyone else always gets
 * the keys tab.
 */
export function useGatewayBudgetsTab(
  canManageGateway: boolean,
): GatewayBudgetsTab {
  const router = useRouter();
  if (!canManageGateway) return "apiKeys";
  switch (router.query.tab) {
    case "apiKeys":
      return "apiKeys";
    case GATEWAY_ORGANIZATION_BUDGETS_TAB.value:
      return GATEWAY_ORGANIZATION_BUDGETS_TAB.value;
    default:
      return "users";
  }
}
