import { prisma } from "../../db";
import { redis, safeMultiDel } from "..";
import { logger } from "../logger";
import type { Cluster, Redis } from "ioredis";

import { type ApiKey } from "../../db";

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
  const hashKeys = apiKeys.map((key) => key.fastHashedSecretKey);

  const filteredHashKeys = hashKeys.filter((hash): hash is string =>
    Boolean(hash),
  );
  if (filteredHashKeys.length === 0) {
    logger.info("No valid keys to invalidate");
    return;
  }

  if (redisClient) {
    logger.info(`Invalidating API keys in redis for ${identifier}`);
    const keysToDelete = filteredHashKeys.map((hash) => `api-key:${hash}`);
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

  const hashKeys = apiKeys
    .map((key) => key.fastHashedSecretKey)
    .filter((hash): hash is string => Boolean(hash));

  if (hashKeys.length === 0) {
    logger.info(`No valid API keys to invalidate for org ${orgId}`);
    return;
  }

  if (redisClient) {
    logger.info(`Invalidating API keys in redis for org ${orgId}`);
    const keysToDelete = hashKeys.map((hash) => `api-key:${hash}`);
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

  const hashKeys = apiKeys
    .map((key) => key.fastHashedSecretKey)
    .filter((hash): hash is string => Boolean(hash));

  if (hashKeys.length === 0) {
    logger.info(`No valid API keys to invalidate for project ${projectId}`);
    return;
  }

  if (redisClient) {
    logger.info(`Invalidating API keys in redis for project ${projectId}`);
    const keysToDelete = hashKeys.map((hash) => `api-key:${hash}`);
    await safeMultiDel(redisClient, keysToDelete);
  }
}
