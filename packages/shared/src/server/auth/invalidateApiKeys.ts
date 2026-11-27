import { prisma } from "../../db";
import { redis, safeMultiDel, scanKeys } from "..";
import { logger } from "../logger";
import { env } from "../../env";
import type { Cluster, Redis } from "ioredis";

import { type ApiKey, type Prisma } from "../../db";
import {
  API_KEY_CACHE_PATTERN,
  apiKeyCacheInvalidated,
  AUTHZ_CONTEXT_CACHE_PATTERN,
  AUTHZ_CONTEXT_CACHE_KEY_PREFIX,
  createApiKeyCacheKey,
  createAuthzContextCacheKey,
  createGatewayResolveContextCacheKey,
  gatewayApiFormats,
} from "./apiKeyCache";
import { createShaHash } from "./apiKeys";

/** invalidatedApiKeyMarkerTtlSeconds outlasts any in-flight request that read a key before it was invalidated */
const invalidatedApiKeyMarkerTtlSeconds = 30;

/** cacheKeysForRows includes legacy and versioned credential entries. */
function cacheKeysForRows(apiKeys: CachedApiKeyIdentity[]): string[] {
  const salt = env.SALT;
  const keys: string[] = [];
  for (const key of apiKeys) {
    if (key.fastHashedSecretKey) {
      keys.push(createApiKeyCacheKey(key.fastHashedSecretKey));
      keys.push(`${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}${key.fastHashedSecretKey}`);
      keys.push(createAuthzContextCacheKey("basic", key.fastHashedSecretKey));
      keys.push(createAuthzContextCacheKey("bearer", key.fastHashedSecretKey));
    }
    if (salt && key.publicKey) {
      const publicHash = createShaHash(key.publicKey, salt);
      keys.push(`${AUTHZ_CONTEXT_CACHE_KEY_PREFIX}${publicHash}`);
      keys.push(createAuthzContextCacheKey("bearer", publicHash));
    }
  }
  return keys;
}

/** invalidateCachedApiKeys marks every cached credential and gateway resolve entry of the keys invalidated */
export async function invalidateCachedApiKeys(
  apiKeys: CachedApiKeyIdentity[],
  identifier: string,
  redisClient: Redis | Cluster | null = redis,
) {
  const keysToInvalidate = [
    ...cacheKeysForRows(apiKeys),
    ...gatewayResolveCacheKeysForRows(apiKeys),
  ];
  if (keysToInvalidate.length === 0) {
    logger.info("No valid keys to invalidate");
    return;
  }
  if (!redisClient) return;

  logger.info(`Invalidating API keys in redis for ${identifier}`);
  const marker = JSON.stringify(apiKeyCacheInvalidated);
  // each key may sit in a different cluster slot, so the writes stay separate
  const results = await Promise.allSettled(
    keysToInvalidate.map((key) =>
      redisClient.set(key, marker, "EX", invalidatedApiKeyMarkerTtlSeconds),
    ),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) {
    logger.error(`Failed to invalidate API keys in redis for ${identifier}`, {
      error: failure.reason,
    });
  }
}

/** gatewayResolveCacheKeysForRows lists each key's gateway resolve cache entry for every API format */
function gatewayResolveCacheKeysForRows(
  apiKeys: CachedApiKeyIdentity[],
): string[] {
  return apiKeys.flatMap(({ fastHashedSecretKey }) => {
    if (!fastHashedSecretKey) return [];
    return gatewayApiFormats.map((apiFormat) =>
      createGatewayResolveContextCacheKey(apiFormat, fastHashedSecretKey),
    );
  });
}

/** invalidateCachedUserApiKeys removes the cached credentials of the user's USER keys in orgId, whose policies include the user's roles. */
export async function invalidateCachedUserApiKeys(
  prisma: Prisma.TransactionClient,
  { orgId, userId }: { orgId: string; userId: string },
  redisClient: Redis | Cluster | null = redis,
): Promise<void> {
  const apiKeys = await prisma.apiKey.findMany({
    where: { orgId, userId, scope: "USER" },
  });
  await invalidateCachedApiKeys(apiKeys, `user ${userId}`, redisClient);
}

/**
 * Invalidate all cached API keys for an organization from Redis cache
 *
 * This function is used when organization-level changes occur that affect API key validity,
 * such as:
 * - Plan changes (subscription created/updated/deleted)
 * - Usage threshold state changes (blocking/unblocking)
 * - Billing cycle changes
 *
 * Note: This only invalidates the Redis cache, not the API keys themselves in the database.
 *
 * @param orgId - The organization ID whose API keys should be invalidated from cache
 */
export async function invalidateCachedOrgApiKeys(
  orgId: string,
  redisClient: Redis | Cluster | null = redis,
): Promise<void> {
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      OR: [
        {
          project: {
            orgId,
          },
        },
        { orgId },
      ],
    },
  });

  const keysToDelete = cacheKeysForRows(apiKeys);
  if (keysToDelete.length === 0) {
    logger.info(`No valid API keys to invalidate for org ${orgId}`);
    return;
  }

  if (redisClient) {
    logger.info(`Invalidating API keys in redis for org ${orgId}`);
    await safeMultiDel(redisClient, keysToDelete);
  }
}

/**
 * Invalidate all cached API keys for a project from Redis cache
 *
 * This function is used when project-level changes occur that affect API key validity.
 *
 * Note: This only invalidates the Redis cache, not the API keys themselves in the database.
 *
 * @param projectId - The project ID whose API keys should be invalidated from cache
 */
export async function invalidateCachedProjectApiKeys(
  projectId: string,
  redisClient: Redis | Cluster | null = redis,
): Promise<void> {
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      projectId: projectId,
      scope: "PROJECT",
    },
  });

  const keysToDelete = cacheKeysForRows(apiKeys);
  if (keysToDelete.length === 0) {
    logger.info(`No valid API keys to invalidate for project ${projectId}`);
    return;
  }

  if (redisClient) {
    logger.info(`Invalidating API keys in redis for project ${projectId}`);
    await safeMultiDel(redisClient, keysToDelete);
  }
}

/**
 * Invalidate every cached API key entry from Redis.
 *
 * This removes only API key cache entries, including cached misses, and does not
 * delete or modify API keys in the database.
 *
 * @returns Number of cache entries invalidated
 */
export async function invalidateAllCachedApiKeys(
  redisClient: Redis | Cluster | null = redis,
): Promise<number> {
  if (!redisClient) {
    logger.info("No redis client available to invalidate cached API keys");
    return 0;
  }

  const [legacyKeys, contextKeys] = await Promise.all([
    scanKeys(redisClient, API_KEY_CACHE_PATTERN),
    scanKeys(redisClient, AUTHZ_CONTEXT_CACHE_PATTERN),
  ]);
  const keysToDelete = [...legacyKeys, ...contextKeys];

  if (keysToDelete.length === 0) {
    logger.info("No cached API keys to invalidate");
    return 0;
  }

  await safeMultiDel(redisClient, keysToDelete);
  logger.info(`Invalidated ${keysToDelete.length} cached API keys in redis`);

  return keysToDelete.length;
}

/** CachedApiKeyIdentity is the part of an api key its cache entries are keyed by */
type CachedApiKeyIdentity = Pick<ApiKey, "fastHashedSecretKey" | "publicKey">;
