import { prisma } from "../../db";
import { redis, safeMultiDel } from "..";
import { logger } from "../logger";

import { type ApiKey } from "../../db";

/**
 * Invalidate specific API keys from Redis cache
 *
 * Utility used by higher-level helpers to remove individual API keys from the cache,
 * e.g. after key rotation, revocation, or entitlement/plan changes.
 *
 * Behavior:
 * - Skips keys without a `fastHashedSecretKey`
 * - No-ops when Redis is not configured
 *
 * @param apiKeys - List of API key records to invalidate
 * @param identifier - Context string for logging (e.g., org or project identifier)
 */
export async function invalidate(apiKeys: ApiKey[], identifier: string) {
  const hashKeys = apiKeys.map((key) => key.fastHashedSecretKey);

  const filteredHashKeys = hashKeys.filter((hash): hash is string =>
    Boolean(hash),
  );
  if (filteredHashKeys.length === 0) {
    logger.info("No valid keys to invalidate");
    return;
  }

  if (redis) {
    logger.info(`Invalidating API keys in redis for ${identifier}`);
    const keysToDelete = filteredHashKeys.map((hash) => `api-key:${hash}`);
    await safeMultiDel(redis, keysToDelete);
  }
}

/**
 * Invalidate all API keys for an organization from Redis cache
 *
 * This function is used when organization-level changes occur that affect API key validity,
 * such as:
 * - Plan changes (subscription created/updated/deleted)
 * - Usage threshold state changes (blocking/unblocking)
 * - Billing cycle changes
 *
 * @param orgId - The organization ID whose API keys should be invalidated
 */
export async function invalidateOrgApiKeys(orgId: string): Promise<void> {
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

  if (redis) {
    logger.info(`Invalidating API keys in redis for org ${orgId}`);
    const keysToDelete = hashKeys.map((hash) => `api-key:${hash}`);
    await safeMultiDel(redis, keysToDelete);
  }
}

/**
 * Invalidate all API keys for a project from Redis cache
 *
 * This function is used when project-level changes occur that affect API key validity.
 *
 * @param projectId - The project ID whose API keys should be invalidated
 */
export async function invalidateProjectApiKeys(
  projectId: string,
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

  if (redis) {
    logger.info(`Invalidating API keys in redis for project ${projectId}`);
    const keysToDelete = hashKeys.map((hash) => `api-key:${hash}`);
    await safeMultiDel(redis, keysToDelete);
  }
}
