import { env } from "../../../env";
import { OAuth2TokenError } from "./errors";

/**
 * Guards against SSRF through operator-configured OAuth2 token endpoints.
 * Checked at write time (creating/updating a connection) and at call time
 * (before every token request), against the resolved token endpoint of the
 * provider profile, not the raw operator input.
 *
 * Throws `OAuth2TokenError`:
 * - `disabled`, when `LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS` is unset
 *   or the endpoint is not on it.
 * - `config`, when the endpoint does not use `https:` and is not the
 *   self-hosted-only `http:` exception (host also in
 *   `LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST`, never on Langfuse Cloud).
 */
export function assertOAuth2TokenEndpointAllowed(tokenEndpoint: string): void {
  const allowedTokenEndpoints = env.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS;

  if (allowedTokenEndpoints.length === 0) {
    throw new OAuth2TokenError(
      "disabled",
      "OAuth2 client credentials are disabled: set LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS",
    );
  }

  let resolvedUrl: URL;
  try {
    resolvedUrl = new URL(tokenEndpoint);
  } catch {
    throw new OAuth2TokenError(
      "config",
      `OAuth2 token endpoint is not a valid URL: ${tokenEndpoint}`,
    );
  }
  const resolvedHref = resolvedUrl.href;

  const isAllowed = allowedTokenEndpoints.some((allowedEndpoint) => {
    try {
      return new URL(allowedEndpoint).href === resolvedHref;
    } catch {
      return false;
    }
  });
  if (!isAllowed) {
    throw new OAuth2TokenError(
      "disabled",
      `OAuth2 token endpoint is not in LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS: ${resolvedHref}`,
    );
  }

  if (resolvedUrl.protocol !== "https:") {
    const isSelfHostedHttpException =
      !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
      env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST.includes(
        resolvedUrl.hostname.toLowerCase(),
      );
    if (!isSelfHostedHttpException) {
      throw new OAuth2TokenError(
        "config",
        `OAuth2 token endpoint must use https: ${resolvedHref} (self-hosted deployments may use http when the host is also in LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST)`,
      );
    }
  }
}
