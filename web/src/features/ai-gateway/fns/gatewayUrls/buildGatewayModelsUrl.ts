import { GATEWAY_MODELS_TABS } from "@/src/features/ai-gateway/constants/gatewayModelsTabs";
import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";

/** The Models tab, filtered to one provider credential when `connectionId` is set. */
export function buildGatewayModelsUrl(
  organizationId: string,
  connectionId?: string,
) {
  const params = new URLSearchParams({ tab: GATEWAY_MODELS_TABS.models });
  if (connectionId) params.set("connectionId", connectionId);

  return `${buildGatewayPagePath(organizationId, GATEWAY_PAGE_SLUGS.models)}?${params.toString()}`;
}
