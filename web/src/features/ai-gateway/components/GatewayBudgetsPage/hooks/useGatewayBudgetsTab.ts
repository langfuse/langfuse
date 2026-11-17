import { useRouter } from "next/router";

import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";

/** The Budgets page tab, kept in the `tab` query parameter. */
export function useGatewayBudgetsTab(): GatewaySpendTab {
  const router = useRouter();
  return router.query.tab === "apiKeys" ? "apiKeys" : "users";
}
