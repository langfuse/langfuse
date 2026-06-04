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

/**
 * Whether the observations v2 public API should use the subquery-IN
 * late-materialization rewrite instead of the CTE+JOIN split query.
 *
 * Gated by LANGFUSE_OBSERVATIONS_V2_SUBQUERY_REWRITE (default "false"). This is a
 * temporary kill-switch: both code paths coexist until the flag is retired in a
 * follow-up, once the new path has soaked in production for one release cycle
 * without regression. The two paths return identical result sets; the flag exists
 * because ClickHouse query plans can shift even when output is byte-identical, so a
 * fast env-flip revert is preferable to a code rollback.
 */
export function shouldUseObservationsSubqueryRewrite(): boolean {
  return env.LANGFUSE_OBSERVATIONS_V2_SUBQUERY_REWRITE === "true";
}
