export function formatGatewayModelSlug(
  connectionName: string,
  providerModel: string,
) {
  return `${connectionName}:${providerModel}`;
}
