const LOCAL_GATEWAY_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Matches numbered preview hosts that use the certificate-covered gateway hostname. */
const PREVIEW_HOST = /^pr-(\d+)\.preview\.langfuse\.com$/;

/** Staging serves the gateway on the product host under `/openai/v1` and `/anthropic`. */
const STAGING_ORIGIN = "https://staging.langfuse.com";

/**
 * Returns the gateway URL shown to users. A configured `publicUrl` wins and is
 * returned without trailing slashes; otherwise it is derived from the product URL.
 */
export function getGatewayBaseUrl(productBaseUrl: URL, publicUrl?: string) {
  if (publicUrl) {
    return new URL(publicUrl).toString().replace(/\/+$/, "");
  }

  if (productBaseUrl.origin === STAGING_ORIGIN) {
    return STAGING_ORIGIN;
  }

  const gatewayBaseUrl = new URL(productBaseUrl);

  if (LOCAL_GATEWAY_HOSTS.has(gatewayBaseUrl.hostname)) {
    gatewayBaseUrl.protocol = "http:";
    gatewayBaseUrl.port = "8080";
  } else {
    gatewayBaseUrl.hostname = toGatewayHostname(gatewayBaseUrl.hostname);
  }

  gatewayBaseUrl.pathname = "/v1";
  gatewayBaseUrl.search = "";
  gatewayBaseUrl.hash = "";
  return gatewayBaseUrl.toString();
}

function toGatewayHostname(hostname: string) {
  const previewNumber = PREVIEW_HOST.exec(hostname)?.[1];
  if (previewNumber) {
    return `gateway-pr-${previewNumber}.preview.langfuse.com`;
  }

  return `gateway.${hostname}`;
}
