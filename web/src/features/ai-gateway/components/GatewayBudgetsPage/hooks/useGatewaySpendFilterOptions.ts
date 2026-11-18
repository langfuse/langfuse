import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { api } from "@/src/utils/api";

const FILTER_OPTION_LIMIT = 100;

/** The tab's budgets the spend chart can be limited to, by subject id. */
export function useGatewaySpendFilterOptions(
  organizationId: string,
  tab: GatewaySpendTab,
) {
  const budgets = api.aiGateway.listBudgets.useQuery({
    orgId: organizationId,
    scope: tab === "apiKeys" ? "API_KEY" : "USER",
    page: 0,
    limit: FILTER_OPTION_LIMIT,
  });
  return (budgets.data?.rows ?? []).map((row) => ({
    value: row.subjectId,
    label: row.name,
  }));
}
