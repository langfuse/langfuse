export const API_KEY_CACHE_KEY_PREFIX = "api-key:";

export const createApiKeyCacheKey = (hash: string) =>
  `${API_KEY_CACHE_KEY_PREFIX}${hash}`;

export const API_KEY_CACHE_PATTERN = createApiKeyCacheKey("*");

/** apiKeyCacheInvalidated marks a credential or gateway resolve cache entry that was just invalidated */
export const apiKeyCacheInvalidated = "api-key-invalidated";

/** AUTHZ_CONTEXT_CACHE_KEY_PREFIX namespaces the policy-core context cache, disjoint from the legacy `api-key:` cache so both coexist in shadow mode. */
export const AUTHZ_CONTEXT_CACHE_KEY_PREFIX = "authz:context:";

/** createAuthzContextCacheKey isolates credential presentations by schema version. */
export const createAuthzContextCacheKey = (
  kind: "basic" | "bearer",
  hash: string,
) => `${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}v3:${kind}:${hash}`;

export const AUTHZ_CONTEXT_CACHE_PATTERN = `${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}*`;

/** gatewayApiFormats are the API formats the AI gateway resolves keys for */
export const gatewayApiFormats = [
  "openai.responses",
  "openai.chat-completions",
  "openai.decisions",
  "openai.embeddings",
  "anthropic.messages",
] as const;

/** createGatewayResolveContextCacheKey is the gateway resolve cache key of a secret key hash for one API format */
export const createGatewayResolveContextCacheKey = (
  apiFormat: string,
  hash: string,
) => `ai-gateway:resolve:context:${apiFormat}:${hash}`;
