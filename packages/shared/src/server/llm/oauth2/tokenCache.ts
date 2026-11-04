import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";
import { env } from "../../../env";
import type { ResolvedOAuth2Profile } from "../../../interfaces/oauth2Providers";
import { logger } from "../../logger";
import type { PreparedOAuth2Credential } from "./credential";
import { OAuth2TokenError } from "./errors";
import { requestOAuth2Token } from "./tokenRequest";

const MAX_CACHED_TOKENS = 1_000;
const REFRESH_MARGIN_SECONDS = 60;
const FAIL_FAST_WINDOW_MS = 30_000;

type CachedToken = { accessToken: string; ttlMs: number };

type FetchContext = {
  profile: ResolvedOAuth2Profile;
  credential: PreparedOAuth2Credential;
  projectId?: string;
};

// Epoch ms until which fetches fail at once, without a request. An endpoint
// that did not answer at all blocks every credential on it; one that kept
// answering with a retryable status only blocks the credential it answered,
// so one client being throttled cannot block other clients of the endpoint.
// Keyed by normalized token endpoint; bounded by the endpoint allowlist.
const endpointUnavailableUntil = new Map<string, number>();
// Keyed by cache key.
const credentialUnavailableUntil = new LRUCache<string, number>({
  max: MAX_CACHED_TOKENS,
});

const tokenCache = new LRUCache<string, CachedToken, FetchContext>({
  max: MAX_CACHED_TOKENS,
  // Token lifetimes are wall-clock time, like the fail-fast window.
  perf: { now: () => Date.now() },
  // Invalidating a key while its fetch is in flight drops the entry but still
  // hands the fetched token to the callers waiting on it.
  ignoreFetchAbort: true,
  fetchMethod: async (key, _stale, { options, context }) => {
    const token = await fetchToken(key, context);
    options.ttl = token.ttlMs;
    return token;
  },
});

/**
 * SHA-256 over everything that shapes the token request plus the hash of the
 * secret, so two connections share a token only when they hold the same
 * credential. Contains no secret, client id or other raw value.
 */
export function getOAuth2CacheKey(
  profile: ResolvedOAuth2Profile,
  credential: PreparedOAuth2Credential,
): string {
  const formParams = Object.keys(profile.formParams)
    .sort()
    .map((name) => [name, profile.formParams[name]]);
  return createHash("sha256")
    .update(
      JSON.stringify([
        profile.tokenEndpoint,
        profile.authMethod,
        profile.clientId,
        formParams,
        profile.assertionAudience,
        profile.sendClientIdWithAssertion,
        profile.assertionAlgorithm ?? null,
        credential.algorithm ?? null,
        credential.fingerprint,
      ]),
    )
    .digest("hex");
}

/**
 * Returns an access token for the profile and credential, from the
 * in-process cache while it is valid (until `expires_in` minus 60 s).
 * Concurrent callers for the same key share one request. After a request
 * ended `unavailable`, fetches fail at once, without a request, for 30 s:
 * for every credential on the token endpoint when the endpoint did not
 * answer (network error or timeout), else only for this credential.
 *
 * @throws OAuth2TokenError from the token request, or `unavailable` while
 * the endpoint or credential is in its fail-fast window.
 */
export async function getOAuth2AccessToken({
  profile,
  credential,
  projectId,
}: {
  profile: ResolvedOAuth2Profile;
  credential: PreparedOAuth2Credential;
  projectId?: string;
}): Promise<{ accessToken: string; cacheKey: string }> {
  const cacheKey = getOAuth2CacheKey(profile, credential);
  const token = await tokenCache.forceFetch(cacheKey, {
    context: { profile, credential, projectId },
  });
  // lru-cache treats a ttl of 0 as "never expires"; such a token is used once.
  if (token.ttlMs === 0 && tokenCache.peek(cacheKey) === token) {
    tokenCache.delete(cacheKey);
  }
  return { accessToken: token.accessToken, cacheKey };
}

/**
 * Drops the cached token after the gateway rejected it, e.g. with a 401. Only
 * the rejected token is dropped: a newer cached token or a fetch already in
 * flight for the key is kept, so callers rejected with the same token share
 * one refetch.
 */
export function invalidateOAuth2AccessToken(
  cacheKey: string,
  rejectedAccessToken: string,
): void {
  // peek() returns undefined while a fetch for the key is in flight.
  if (tokenCache.peek(cacheKey)?.accessToken === rejectedAccessToken) {
    tokenCache.delete(cacheKey);
  }
}

export function clearOAuth2TokenCache(): void {
  tokenCache.clear();
  endpointUnavailableUntil.clear();
  credentialUnavailableUntil.clear();
}

function assertNotFailingFast(
  windows: Pick<Map<string, number>, "get" | "delete">,
  key: string,
): void {
  const failFastUntil = windows.get(key);
  if (failFastUntil === undefined) return;
  if (Date.now() < failFastUntil) {
    throw new OAuth2TokenError(
      "unavailable",
      `OAuth2 token endpoint was unavailable recently; it will be retried after ${new Date(failFastUntil).toISOString()}`,
    );
  }
  windows.delete(key);
}

async function fetchToken(
  cacheKey: string,
  { profile, credential, projectId }: FetchContext,
): Promise<CachedToken> {
  const endpoint = new URL(profile.tokenEndpoint).href;
  assertNotFailingFast(endpointUnavailableUntil, endpoint);
  assertNotFailingFast(credentialUnavailableUntil, cacheKey);

  let result;
  try {
    result = await requestOAuth2Token({
      profile,
      credential,
      maxRetries: env.LANGFUSE_LLM_OAUTH2_TOKEN_MAX_RETRIES,
    });
  } catch (error) {
    if (error instanceof OAuth2TokenError && error.kind === "unavailable") {
      const until = Date.now() + FAIL_FAST_WINDOW_MS;
      if (error.lastFailure === "network" || error.lastFailure === "timeout") {
        endpointUnavailableUntil.set(endpoint, until);
      } else {
        credentialUnavailableUntil.set(cacheKey, until);
      }
    }
    throw error;
  }
  endpointUnavailableUntil.delete(endpoint);
  credentialUnavailableUntil.delete(cacheKey);

  logger.info("OAuth2 access token fetched", {
    projectId,
    provider: profile.provider,
    host: new URL(profile.tokenEndpoint).host,
    authMethod: profile.authMethod,
    expiresIn: result.expiresInSeconds,
    attempts: result.attempts,
  });

  return {
    accessToken: result.accessToken,
    ttlMs: Math.max(result.expiresInSeconds - REFRESH_MARGIN_SECONDS, 0) * 1000,
  };
}
