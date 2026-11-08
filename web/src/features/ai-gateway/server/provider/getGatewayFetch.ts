import {
  assertLlmProviderHostAllowed,
  createSecureLlmFetch,
} from "@langfuse/shared/src/server";

const ANTHROPIC_API_KEY_HEADER = "x-api-key";

const allowlistedFetch: typeof fetch = async (input, init) => {
  assertLlmProviderHostAllowed(
    new URL(input instanceof Request ? input.url : input).hostname,
  );
  return fetch(input, init);
};

/**
 * Bedrock's regional hosts and the official origins are fixed and may resolve
 * to private VPC-endpoint addresses, so they skip the private-address checks
 * but still respect the LLM host allowlist, as LLM connections and the gateway do.
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
