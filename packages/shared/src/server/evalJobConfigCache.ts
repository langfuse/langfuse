import { logger } from "./logger";
import { redis } from "./";

/**
 * Redis cache utilities for eval job configuration optimization.
 *
 * This module provides caching functionality to reduce database calls when
 * checking for job configurations. When a project has no active evaluation
 * job configurations, we cache this information in Redis to avoid unnecessary
 * database queries and queue processing.
 */

/** Cache types for different eval job configuration targets */
type EvalConfigCacheType = "traceBased" | "eventBased";

const CACHE_PREFIXES: Record<EvalConfigCacheType, string> = {
  traceBased: "langfuse:eval:no-trace-and-dataset-job-configs", // for target_object 'trace' | 'observation'
  eventBased: "langfuse:eval:no-event-and-experiment-job-configs", // for target_object 'event' | 'experiment'
};

const CACHE_TTL_SECONDS = 600; // 10 minutes

/**
 * Check if a project has no eval configurations cached in Redis.
 * Returns true if the cache indicates no configs exist.
 */
export const hasNoEvalConfigsCache = async (
  projectId: string,
  cacheType: EvalConfigCacheType,
): Promise<boolean> => {
  if (!redis) {
    return false;
  }

  try {
    const cacheKey = `${CACHE_PREFIXES[cacheType]}:${projectId}`;
    const cached = await redis.get(cacheKey);

    return Boolean(cached);
  } catch (error) {
    logger.error(`Failed to check no ${cacheType} eval configs cache`, error);

    return false;
  }
};

/**
 * Cache that a project has no active eval configurations.
 * The cache expires after 10 minutes to ensure eventual consistency.
 */
export const setNoEvalConfigsCache = async (
  projectId: string,
  cacheType: EvalConfigCacheType,
): Promise<void> => {
  if (!redis) {
    return;
  }

  try {
    const cacheKey = `${CACHE_PREFIXES[cacheType]}:${projectId}`;
    await redis.setex(cacheKey, CACHE_TTL_SECONDS, "1");
    logger.debug(
      `Cached no ${cacheType} eval configs for project ${projectId}`,
    );
  } catch (error) {
    logger.error(`Failed to cache no ${cacheType} eval configs status`, error);
  }
};

/**
 * Clear the "no eval configs" cache for a project.
 * Should be called when job configurations are created or activated.
 */
export const clearNoEvalConfigsCache = async (
  projectId: string,
  cacheType: EvalConfigCacheType,
): Promise<void> => {
  if (!redis) {
    return;
  }

  try {
    const cacheKey = `${CACHE_PREFIXES[cacheType]}:${projectId}`;
    await redis.del(cacheKey);
    logger.debug(
      `Cleared no ${cacheType} eval configs cache for project ${projectId}`,
    );
  } catch (error) {
    logger.error(`Failed to clear no ${cacheType} eval configs cache`, error);
  }
};
