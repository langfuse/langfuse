export function getGatewayBaseUrl(productBaseUrl: URL) {
  const gatewayBaseUrl = new URL(productBaseUrl);
  gatewayBaseUrl.hostname = `gateway.${gatewayBaseUrl.hostname}`;
  gatewayBaseUrl.pathname = "/v1";
  gatewayBaseUrl.search = "";
  gatewayBaseUrl.hash = "";
  return gatewayBaseUrl.toString();
}
