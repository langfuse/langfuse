import { prisma } from "../../db";
import { redis, safeMultiDel, scanKeys } from "..";
import { logger } from "../logger";
import { env } from "../../env";
import type { Cluster, Redis } from "ioredis";

import { type ApiKey } from "../../db";
import {
  API_KEY_CACHE_PATTERN,
  AUTHZ_CONTEXT_CACHE_PATTERN,
  createApiKeyCacheKey,
  createAuthzContextCacheKey,
} from "./apiKeyCache";
import { createShaHash } from "./apiKeys";

/**
 * Redis keys to delete per API key row, across both cache namespaces:
 * legacy `api-key:<fastHash>` plus the policy-core `authz:context:` keys for
 * every presentation of the key — `sha(secret+salt)` (== fastHash) and
 * `sha(publicKey+salt)`. Public-key rows are covered even without a fast hash.
 */
function cacheKeysForRows(apiKeys: ApiKey[]): string[] {
  const salt = env.SALT;
  const keys: string[] = [];
  for (const key of apiKeys) {
    if (key.fastHashedSecretKey) {
      keys.push(createApiKeyCacheKey(key.fastHashedSecretKey));
      keys.push(createAuthzContextCacheKey(key.fastHashedSecretKey));
    }
    if (salt && key.publicKey) {
      keys.push(createAuthzContextCacheKey(createShaHash(key.publicKey, salt)));
    }
  }
  return keys;
}

/**
 * Invalidate cached API keys from Redis cache
 *
 * Utility used by higher-level helpers to remove individual API keys from the cache,
 * e.g. after key rotation, revocation, or entitlement/plan changes.
 *
 * Note: This only invalidates the Redis cache, not the API keys themselves in the database.
 *
 * Behavior:
 * - Skips keys without a `fastHashedSecretKey`
 * - No-ops when Redis is not configured
 *
 * @param apiKeys - List of API key records to invalidate from cache
 * @param identifier - Context string for logging (e.g., org or project identifier)
 */
export async function invalidateCachedApiKeys(
  apiKeys: ApiKey[],
  identifier: string,
  redisClient: Redis | Cluster | null = redis,
) {
  const keysToDelete = cacheKeysForRows(apiKeys);
  if (keysToDelete.length === 0) {
    logger.info("No valid keys to invalidate");
    return;
  }

  if (redisClient) {
    logger.info(`Invalidating API keys in redis for ${identifier}`);
    await safeMultiDel(redisClient, keysToDelete);
  }
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
