const LOCAL_GATEWAY_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function getGatewayBaseUrl(productBaseUrl: URL) {
  const gatewayBaseUrl = new URL(productBaseUrl);

  if (LOCAL_GATEWAY_HOSTS.has(gatewayBaseUrl.hostname)) {
    gatewayBaseUrl.protocol = "http:";
    gatewayBaseUrl.port = "8080";
  } else {
    gatewayBaseUrl.hostname = `gateway.${gatewayBaseUrl.hostname}`;
  }

  gatewayBaseUrl.pathname = "/v1";
  gatewayBaseUrl.search = "";
  gatewayBaseUrl.hash = "";
  return gatewayBaseUrl.toString();
}
