import { redis } from "./redis";
import { logger } from "../logger";
import { traceException, recordIncrement } from "../instrumentation";
import { env } from "../../env";

export { isS3SlowDownError } from "../services/s3ThrottleError";

const S3_SLOWDOWN_PREFIX = "langfuse:s3-slowdown";

function isSlowdownEnabled(): boolean {
  return env.LANGFUSE_S3_RATE_ERROR_SLOWDOWN_ENABLED === "true";
}

/**
 * Mark a project as experiencing S3 SlowDown errors.
 * Sets a Redis key with TTL to trigger secondary queue routing.
 */
export async function markProjectS3Slowdown(projectId: string): Promise<void> {
  if (!redis || !isSlowdownEnabled()) return;

  const ttlSeconds = env.LANGFUSE_S3_RATE_ERROR_SLOWDOWN_TTL_SECONDS;

  try {
    const key = `${S3_SLOWDOWN_PREFIX}:${projectId}`;
    await redis.set(key, "1", "EX", ttlSeconds);
    logger.warn("Marked project for S3 slowdown redirect", {
      projectId,
      ttlSeconds,
    });
    recordIncrement("langfuse.s3_slowdown.marked", 1);
  } catch (error) {
    logger.error("Failed to mark S3 slowdown", { projectId, error });
    traceException(error);
    // Do not raise and fallthrough
  }
}

/**
 * Check if a project has an S3 SlowDown flag set.
 * Returns false on error to fail open (don't redirect unnecessarily).
 */
export async function hasS3SlowdownFlag(projectId: string): Promise<boolean> {
  if (!redis || !isSlowdownEnabled()) return false;

  try {
    const key = `${S3_SLOWDOWN_PREFIX}:${projectId}`;
    const result = await redis.get(key);
    return result === "1";
  } catch (error) {
    logger.error("Failed to check S3 slowdown flag", { projectId, error });
    return false; // Fail open - don't redirect unnecessarily
  }
}
