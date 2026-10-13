const LOCAL_GATEWAY_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// *.preview.langfuse.com is one label. gateway.pr-<n> is two labels, so it
// misses the preview certificate and the external-dns wildcard.
const PREVIEW_HOST = /^pr-(\d+)\.preview\.langfuse\.com$/;

export function getGatewayBaseUrl(productBaseUrl: URL) {
  const gatewayBaseUrl = new URL(productBaseUrl);

  if (LOCAL_GATEWAY_HOSTS.has(gatewayBaseUrl.hostname)) {
    gatewayBaseUrl.protocol = "http:";
    gatewayBaseUrl.port = "8080";
  } else {
    const previewNumber = PREVIEW_HOST.exec(gatewayBaseUrl.hostname)?.[1];
    if (previewNumber) {
      gatewayBaseUrl.hostname = `gateway-pr-${previewNumber}.preview.langfuse.com`;
    } else {
      gatewayBaseUrl.hostname = `gateway.${gatewayBaseUrl.hostname}`;
    }
  }

  gatewayBaseUrl.pathname = "/v1";
  gatewayBaseUrl.search = "";
  gatewayBaseUrl.hash = "";
  return gatewayBaseUrl.toString();
}
