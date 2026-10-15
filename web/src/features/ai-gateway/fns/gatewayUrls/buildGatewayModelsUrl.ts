export function buildGatewayModelsUrl(
  organizationId: string,
  connectionId: string,
) {
  const params = new URLSearchParams({ connectionId });

  return `/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway-providers?${params.toString()}`;
}
