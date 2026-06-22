export const API_KEY_CACHE_KEY_PREFIX = "api-key:";

export const createApiKeyCacheKey = (hash: string) =>
  `${API_KEY_CACHE_KEY_PREFIX}${hash}`;

export const API_KEY_CACHE_PATTERN = createApiKeyCacheKey("*");
