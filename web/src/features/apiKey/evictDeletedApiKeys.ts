import { type ApiKey } from "@langfuse/shared/src/db";
import { invalidateCachedApiKeys, logger } from "@langfuse/shared/src/server";
import { invalidateGatewayResolveCacheForApiKey } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";

/** evictDeletedApiKeys clears the credential and gateway resolve caches of committed deletions, logging failures instead of throwing */
export async function evictDeletedApiKeys(
  apiKeys: Pick<ApiKey, "id" | "fastHashedSecretKey" | "publicKey">[],
  identifier: string,
): Promise<void> {
  if (apiKeys.length === 0) return;
  // started together so a failed credential eviction cannot skip the gateway one
  const results = await Promise.allSettled([
    invalidateCachedApiKeys(apiKeys, identifier),
    ...apiKeys.map(evictGatewayResolveCache),
  ]);
  for (const result of results) {
    if (result.status === "fulfilled") continue;
    logger.error("Failed to evict deleted API keys", {
      apiKeyIds: apiKeys.map((apiKey) => apiKey.id),
      error: result.reason,
    });
  }
}

/** evictGatewayResolveCache drops the key's cached gateway resolve contexts */
async function evictGatewayResolveCache(apiKey: {
  fastHashedSecretKey: string | null;
}): Promise<void> {
  if (!apiKey.fastHashedSecretKey) return;
  await invalidateGatewayResolveCacheForApiKey(apiKey.fastHashedSecretKey);
}
