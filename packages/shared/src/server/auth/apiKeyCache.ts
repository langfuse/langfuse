export const API_KEY_CACHE_KEY_PREFIX = "api-key:";

export const createApiKeyCacheKey = (hash: string) =>
  `${API_KEY_CACHE_KEY_PREFIX}${hash}`;

export const API_KEY_CACHE_PATTERN = createApiKeyCacheKey("*");

/** AUTHZ_CONTEXT_CACHE_KEY_PREFIX namespaces the policy-core context cache, disjoint from the legacy `api-key:` cache so both coexist in shadow mode. */
export const AUTHZ_CONTEXT_CACHE_KEY_PREFIX = "authz:context:";

/** createAuthzContextCacheKey isolates credential presentations by schema version. */
export const createAuthzContextCacheKey = (
  kind: "basic" | "bearer",
  hash: string,
) => `${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}v2:${kind}:${hash}`;

export const AUTHZ_CONTEXT_CACHE_PATTERN = `${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}*`;
