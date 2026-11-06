import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";

export function buildGatewayModelsUrl(
  organizationId: string,
  connectionId: string,
) {
  const params = new URLSearchParams({ connectionId });

  return `${buildGatewayPagePath(organizationId)}?${params.toString()}`;
}
