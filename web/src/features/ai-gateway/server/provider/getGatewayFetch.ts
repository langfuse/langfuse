import {
  createSecureLlmFetch,
  llmBaseUrlWhitelistFromEnv,
  OutboundUrlValidationError,
} from "@langfuse/shared/src/server";

const ANTHROPIC_API_KEY_HEADER = "x-api-key";

const allowlistedFetch: typeof fetch = async (input, init) => {
  const allowedHosts = llmBaseUrlWhitelistFromEnv().allowedHosts ?? [];
  const url = new URL(input instanceof Request ? input.url : input);
  if (allowedHosts.length > 0 && !allowedHosts.includes(url.hostname)) {
    throw new OutboundUrlValidationError(
      "host-not-allowed",
      "Host is not in the outbound URL allowlist",
    );
  }
  return fetch(input, init);
};

/**
 * Bedrock's regional hosts and the official origins are fixed and may resolve
 * to private VPC-endpoint addresses, so they skip the private-address checks
 * but still respect a configured host allowlist, as in the gateway.
 */
export function getGatewayFetch(params: {
  baseURL: string | null;
  extraHeaders: Record<string, string>;
  logContext: string;
}): typeof fetch {
  if (!params.baseURL) return allowlistedFetch;
  // A cross-origin redirect strips only `authorization`-style headers by
  // default, so Anthropic's key and extra headers that can carry proxy
  // credentials are listed explicitly.
  return createSecureLlmFetch({
    logContext: params.logContext,
    additionalSensitiveHeaders: [
      ANTHROPIC_API_KEY_HEADER,
      ...Object.keys(params.extraHeaders),
    ],
  });
}
