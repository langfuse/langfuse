import { createSecureLlmFetch } from "@langfuse/shared/src/server";

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
  // Extra headers can carry proxy credentials, so a cross-origin redirect
  // strips them like the provider auth headers.
  return createSecureLlmFetch({
    logContext: params.logContext,
    additionalSensitiveHeaders: Object.keys(params.extraHeaders),
  });
}
