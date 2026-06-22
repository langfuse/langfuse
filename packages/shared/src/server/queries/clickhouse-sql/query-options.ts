import { isProjectOtelUser } from "../../redis/otelProjectTracking";
import { recordIncrement } from "../../";
import { env } from "../../../env";

/**
 * Determines whether the FINAL modifier should be skipped for observations queries.
 *
 * Logic flow:
 * 1. Check LANGFUSE_API_CLICKHOUSE_DISABLE_OBSERVATIONS_FINAL (takes precedence)
 * 2. If LANGFUSE_SKIP_FINAL_FOR_OTEL_PROJECTS is enabled, check Redis for project OTEL usage
 * 3. Returns boolean
 */
export async function shouldSkipObservationsFinal(
  projectId: string,
): Promise<boolean> {
  // Check env var first (takes precedence) - only if env is provided
  if (env.LANGFUSE_API_CLICKHOUSE_DISABLE_OBSERVATIONS_FINAL === "true") {
    recordIncrement("query.final_modifier.skipped", 1, {
      reason: "env_var",
    });
    return true;
  }

  // Check if OTEL tracking feature is enabled and if project uses OTEL
  const isOtelProject = await isProjectOtelUser(projectId);

  if (isOtelProject) {
    recordIncrement("query.final_modifier.skipped", 1, {
      reason: "otel_tracking",
    });
    return true;
  }

  return false;
}
