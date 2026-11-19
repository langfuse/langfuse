import { useRouter } from "next/router";

import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";

/**
 * The Budgets page tab, kept in the `tab` query parameter. Only gateway
 * managers see user budgets, so everyone else always gets the keys tab.
 */
export function useGatewayBudgetsTab(
  canManageGateway: boolean,
): GatewaySpendTab {
  const router = useRouter();
  if (!canManageGateway) return "apiKeys";
  return router.query.tab === "apiKeys" ? "apiKeys" : "users";
}
