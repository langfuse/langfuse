import { aiGatewayPath } from "@/src/features/ai-gateway/fns/gatewayUrls/aiGatewayPath";

export function buildGatewayModelsUrl(
  organizationId: string,
  connectionId: string,
) {
  const params = new URLSearchParams({ connectionId });

  return `${aiGatewayPath(organizationId)}?${params.toString()}`;
}
