import type { PageTabsProps } from "@/src/components/layouts/PageTabs";
import {
  GATEWAY_MODELS_TABS,
  type GatewayModelsTab,
} from "@/src/features/ai-gateway/constants/gatewayModelsTabs";
import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";

export function buildGatewayModelsTabs(
  organizationId: string,
  activeTab: GatewayModelsTab,
): PageTabsProps {
  const href = buildGatewayPagePath(organizationId, GATEWAY_PAGE_SLUGS.models);
  return {
    activeTab,
    tabs: [
      { value: GATEWAY_MODELS_TABS.providers, label: "Connections", href },
      {
        value: GATEWAY_MODELS_TABS.models,
        label: "Models",
        href,
        querySelector: () => ({ tab: GATEWAY_MODELS_TABS.models }),
      },
    ],
  };
}
