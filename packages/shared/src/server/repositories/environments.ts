import { LISTABLE_SCORE_TYPES } from "../../domain/scores";
import { env } from "../../env";
import { queryClickhouse } from "./clickhouse";

export type EnvironmentFilterProps = {
  projectId: string;
  fromTimestamp?: Date;
};

export const getEnvironmentsForProject = async (
  props: EnvironmentFilterProps,
): Promise<{ environment: string }[]> => {
  const { projectId, fromTimestamp } = props;

  // In dual and events_only write modes all tracing data lands in the events
  // tables: a single events_core scan covers traces and observations and is
  // the only populated source under events_only. Scores keep their own table
  // in every write mode. The events read may be routed to a dedicated
  // ClickHouse service (CLICKHOUSE_EVENTS_READ_ONLY_URL), so it cannot share
  // a query with the scores read.
  const tracingEnvironmentsPromise =
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy"
      ? queryClickhouse<{ environment: string }>({
          query: `
            (
              SELECT distinct environment
              FROM traces
              WHERE project_id = {projectId: String}
              ${fromTimestamp ? "AND timestamp >= {fromTimestamp: DateTime64(3)}" : ""}
            ) UNION ALL (
              SELECT distinct environment
              FROM observations
              WHERE project_id = {projectId: String}
              ${fromTimestamp ? "AND start_time >= {fromTimestamp: DateTime64(3)}" : ""}
            )
          `,
          params: { projectId, fromTimestamp },
          tags: { projectId },
          preferredClickhouseService: "ReadOnly",
        })
      : queryClickhouse<{ environment: string }>({
          query: `
            SELECT distinct environment
            FROM events_core
            WHERE project_id = {projectId: String}
            ${fromTimestamp ? "AND start_time >= {fromTimestamp: DateTime64(3)}" : ""}
          `,
          params: { projectId, fromTimestamp },
          tags: { projectId },
          preferredClickhouseService: "EventsReadOnly",
        });

  const scoreEnvironmentsPromise = queryClickhouse<{ environment: string }>({
    query: `
      SELECT distinct environment
      FROM scores
      WHERE project_id = {projectId: String}
      AND data_type IN ({dataTypes: Array(String)})
      ${fromTimestamp ? "AND timestamp >= {fromTimestamp: DateTime64(3)}" : ""}
    `,
    params: { projectId, fromTimestamp, dataTypes: LISTABLE_SCORE_TYPES },
    tags: { projectId },
    preferredClickhouseService: "ReadOnly",
  });

  const results = (
    await Promise.all([tracingEnvironmentsPromise, scoreEnvironmentsPromise])
  ).flat();

  // Always add default environment to list
  results.push({ environment: "default" });

  return Array.from(new Set(results.map((e) => e.environment))).map(
    (environment) => ({
      environment,
    }),
  );
};

export type EnvironmentCount = {
  environment: string;
  count: number;
};

/**
 * Same env discovery as `getEnvironmentsForProject`, but with a per-environment
 * distinct-trace count. Used by the seeder CLI's `env` subcommand and similar
 * data-inspection flows where the caller wants to know how much data is in
 * each environment, not just the names.
 *
 * The count is the number of distinct traces per environment, scoped to the
 * project. In legacy write mode this is `count(DISTINCT id)` against the
 * `traces` table; in dual/events_only it is `count(DISTINCT trace_id)` against
 * `events_core` (one row per span). This matches the env-semantic the UI
 * shows: a single trace belongs to exactly one environment.
 */
export const getEnvironmentsWithCountsForProject = async (
  props: EnvironmentFilterProps,
): Promise<EnvironmentCount[]> => {
  const { projectId, fromTimestamp } = props;

  const result =
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy"
      ? queryClickhouse<EnvironmentCount>({
          query: `
            SELECT environment, count(DISTINCT id) AS count
            FROM traces
            WHERE project_id = {projectId: String}
            ${fromTimestamp ? "AND timestamp >= {fromTimestamp: DateTime64(3)}" : ""}
            GROUP BY environment
          `,
          params: { projectId, fromTimestamp },
          tags: { projectId },
          preferredClickhouseService: "ReadOnly",
        })
      : queryClickhouse<EnvironmentCount>({
          query: `
            SELECT environment, count(DISTINCT trace_id) AS count
            FROM events_core
            WHERE project_id = {projectId: String}
            ${fromTimestamp ? "AND start_time >= {fromTimestamp: DateTime64(3)}" : ""}
            GROUP BY environment
          `,
          params: { projectId, fromTimestamp },
          tags: { projectId },
          preferredClickhouseService: "EventsReadOnly",
        });

  const counts = await result;

  // Always include the default environment, even if no rows exist for it.
  const byEnv = new Map<string, EnvironmentCount>(
    counts.map((row) => [row.environment, row]),
  );
  if (!byEnv.has("default")) {
    byEnv.set("default", { environment: "default", count: 0 });
  }

  return Array.from(byEnv.values()).sort((a, b) => b.count - a.count);
};
