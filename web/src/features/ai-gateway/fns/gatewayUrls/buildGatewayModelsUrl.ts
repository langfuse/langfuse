import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";

export function buildGatewayModelsUrl(
  organizationId: string,
  connectionId: string,
) {
  const params = new URLSearchParams({ connectionId });

  return `${buildGatewayPagePath(organizationId, GATEWAY_PAGE_SLUGS.providers)}?${params.toString()}`;
}
