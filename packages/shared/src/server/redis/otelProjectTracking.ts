import { redis } from "./redis";
import { env } from "../../env";
import { logger, traceException, recordIncrement } from "../";

const TTL_SECONDS = 86400; // 24 hours

/**
 * Marks a project as using OTEL API ingestion in Redis with a 24-hour TTL.
 * Only performs the operation if LANGFUSE_SKIP_FINAL_FOR_OTEL_PROJECTS is enabled.
 */
export async function markProjectAsOtelUser(projectId: string): Promise<void> {
  // Check if feature is enabled
  if (env.LANGFUSE_SKIP_FINAL_FOR_OTEL_PROJECTS !== "true") {
    return;
  }

  try {
    const key = `langfuse:project:${projectId}:otel:active`;
    await redis?.set(key, "1", "EX", TTL_SECONDS);
    recordIncrement("redis.otel_tracking.marked", 1);
  } catch (error) {
    // Log error but don't throw - Redis failures should not break ingestion
    traceException(error);
    logger.error("Failed to mark project as OTEL user", { projectId, error });
  }
}

/**
 * Checks if a project is currently marked as using OTEL API ingestion.
 * Returns false if feature is disabled or if Redis key doesn't exist.
 */
export async function isProjectOtelUser(projectId: string): Promise<boolean> {
  // If feature is disabled, always return false
  if (env.LANGFUSE_SKIP_FINAL_FOR_OTEL_PROJECTS !== "true") {
    return false;
  }

  try {
    const key = `langfuse:project:${projectId}:otel:active`;
    const result = await redis?.get(key);
    return result === "1";
  } catch (error) {
    // Log error and return false (safe fallback - keep FINAL)
    traceException(error);
    logger.error("Failed to check if project is OTEL user", {
      projectId,
      error,
    });
    return false;
  }
}
