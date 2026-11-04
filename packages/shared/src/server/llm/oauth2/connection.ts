import {
  resolveOAuth2Profile,
  type OAuth2Config,
} from "../../../interfaces/oauth2Providers";
import { assertOAuth2TokenEndpointAllowed } from "./allowlist";
import { prepareOAuth2Credential } from "./credential";
import { OAuth2TokenError } from "./errors";
import {
  getOAuth2AccessToken,
  invalidateOAuth2AccessToken,
} from "./tokenCache";

/**
 * Resolves the access token for an OAuth2 LLM connection: checks the token
 * endpoint against the allowlist (on every call, cached token or not), then
 * returns a token from the cache or the token endpoint.
 *
 * `wrapFetch` wraps the fetch handed to the provider SDK: when the gateway
 * answers 401, it drops the rejected token, gets a fresh one and re-sends the
 * same request once with the new `Authorization` header. A second 401 goes
 * back to the caller unchanged.
 *
 * @throws OAuth2TokenError when the endpoint is not allowed, the credential is
 * invalid or no token can be obtained.
 */
export async function resolveOAuth2Connection({
  config,
  decryptedSecret,
  projectId,
}: {
  config: { oauth2: OAuth2Config };
  decryptedSecret: string;
  projectId?: string;
}): Promise<{
  accessToken: string;
  wrapFetch: (fetchFn: typeof fetch) => typeof fetch;
}> {
  const profile = resolveOAuth2Profile(config.oauth2);
  assertOAuth2TokenEndpointAllowed(profile.tokenEndpoint);
  const credential = await prepareOAuth2Credential(profile, decryptedSecret);
  const { accessToken, cacheKey } = await getOAuth2AccessToken({
    profile,
    credential,
    projectId,
  });

  const wrapFetch =
    (fetchFn: typeof fetch): typeof fetch =>
    async (input, init) => {
      const response = await fetchFn(input, init);
      if (response.status !== 401 || !canResend(input, init)) {
        return response;
      }

      await response.body?.cancel().catch(() => undefined);
      // The provider was built with `accessToken`, so that is the token the
      // gateway rejected.
      invalidateOAuth2AccessToken(cacheKey, accessToken);
      const refreshed = await getOAuth2AccessToken({
        profile,
        credential,
        projectId,
      });
      return fetchFn(input, {
        ...init,
        headers: withBearerToken(input, init, refreshed.accessToken),
      });
    };

  return { accessToken, wrapFetch };
}

/**
 * Rejects OAuth2 connections in code paths that send the stored secret
 * directly as an API key, so a client secret or private key never reaches
 * an LLM gateway.
 */
export function assertNotOAuth2Connection(
  config: unknown,
  context: string,
): void {
  if (
    typeof config === "object" &&
    config !== null &&
    "oauth2" in config &&
    config.oauth2 !== undefined
  ) {
    throw new OAuth2TokenError(
      "config",
      `OAuth2 connections are not supported for ${context}`,
    );
  }
}

// A request body can be sent again unless it is a stream, which the first
// attempt has consumed.
function canResend(
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
): boolean {
  if (init?.body !== undefined) {
    const body = init.body;
    return (
      body === null ||
      typeof body === "string" ||
      body instanceof URLSearchParams ||
      body instanceof Blob ||
      body instanceof FormData ||
      body instanceof ArrayBuffer ||
      ArrayBuffer.isView(body)
    );
  }
  return !(input instanceof Request) || input.body === null;
}

function withBearerToken(
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
  accessToken: string,
): Headers {
  // fetch takes the headers from `init` when given, else from the Request.
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}
