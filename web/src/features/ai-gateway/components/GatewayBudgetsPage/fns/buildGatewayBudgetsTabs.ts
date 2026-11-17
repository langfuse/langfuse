import type { PageTabsProps } from "@/src/components/layouts/PageTabs";
import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";

export function buildGatewayBudgetsTabs(
  organizationId: string,
  activeTab: GatewaySpendTab,
): PageTabsProps {
  const href = buildGatewayPagePath(organizationId, GATEWAY_PAGE_SLUGS.budgets);
  return {
    activeTab,
    tabs: [
      { value: "apiKeys", label: GATEWAY_SPEND_TABS.apiKeys.label, href },
      {
        value: "users",
        label: GATEWAY_SPEND_TABS.users.label,
        href,
        querySelector: () => ({ tab: "users" }),
      },
    ],
  };
}
