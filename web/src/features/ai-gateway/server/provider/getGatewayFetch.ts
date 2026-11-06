import { createSecureLlmFetch } from "@langfuse/shared/src/server";

const ANTHROPIC_API_KEY_HEADER = "x-api-key";

/**
 * Bedrock's regional hosts and the official origins are fixed and may resolve
 * to private VPC-endpoint addresses, so only a custom base URL gets the
 * outbound checks, as in the gateway.
 */
export function getGatewayFetch(params: {
  baseURL: string | null;
  extraHeaders: Record<string, string>;
  logContext: string;
}): typeof fetch {
  if (!params.baseURL) return fetch;
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
