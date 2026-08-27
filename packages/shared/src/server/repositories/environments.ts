import { LISTABLE_SCORE_TYPES } from "../../domain/scores";
import { env } from "../../env";
import type { ExecutionContext } from "../query-ast/executionContext";
import { compileClickhouseQuery } from "../query-ast/kysely/compile";
import { getClickhouseKysely } from "../query-ast/kysely/dialect";
import { queryClickhouse } from "./clickhouse";

export type EnvironmentFilterProps = {
  projectId: string;
  fromTimestamp?: Date;
};

type EnvironmentsQueryInput = {
  projectId: string;
  fromTimestamp?: Date;
  writeMode: "legacy" | "events_only" | "dual";
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
  const { tracing, scores } = compileEnvironmentsQueries({
    projectId,
    fromTimestamp,
    writeMode: env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
  });

  const tracingEnvironmentsPromise = queryClickhouse<{ environment: string }>({
    query: tracing.sql,
    params: tracing.params,
    tags: { projectId, route: "environments.getEnvironmentsForProject" },
    preferredClickhouseService:
      env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy"
        ? "ReadOnly"
        : "EventsReadOnly",
  });

  const scoreEnvironmentsPromise = queryClickhouse<{ environment: string }>({
    query: scores.sql,
    params: scores.params,
    tags: { projectId, route: "environments.getEnvironmentsForProject" },
    preferredClickhouseService: "ReadOnly",
  });

  const results = (
    await Promise.all([tracingEnvironmentsPromise, scoreEnvironmentsPromise])
  ).flat();

  // "default" always exists as a selectable environment even when no rows
  // have been written under it, so it is not guaranteed to appear in the scan.
  results.push({ environment: "default" });

  return Array.from(new Set(results.map((e) => e.environment))).map(
    (environment) => ({
      environment,
    }),
  );
};

/**
 * `getEnvironmentsForProject` as traced Kysely nodes, compiled to SQL.
 * Two statements (tracing read + scores read) matching the exec split above:
 * events may route to a dedicated ClickHouse service.
 */
function compileEnvironmentsQueries(input: EnvironmentsQueryInput): {
  tracing: { sql: string; params: Record<string, unknown> };
  scores: { sql: string; params: Record<string, unknown> };
} {
  const ctx: ExecutionContext = { projectId: input.projectId };
  return {
    tracing: compileClickhouseQuery(buildTracingQuery(input), ctx),
    scores: compileClickhouseQuery(buildScoresQuery(input), ctx),
  };
}

function buildTracingQuery(input: EnvironmentsQueryInput) {
  const db = getClickhouseKysely();
  const { projectId, fromTimestamp } = input;

  if (input.writeMode === "legacy") {
    const traces = db
      .selectFrom("traces")
      .select("environment")
      .distinct()
      .where("project_id", "=", projectId)
      .$if(fromTimestamp != null, (qb) =>
        qb.where("timestamp", ">=", fromTimestamp!),
      );

    const observations = db
      .selectFrom("observations")
      .select("environment")
      .distinct()
      .where("project_id", "=", projectId)
      .$if(fromTimestamp != null, (qb) =>
        qb.where("start_time", ">=", fromTimestamp!),
      );

    return traces.unionAll(observations);
  }

  return db
    .selectFrom("events_core")
    .select("environment")
    .distinct()
    .where("project_id", "=", projectId)
    .$if(fromTimestamp != null, (qb) =>
      qb.where("start_time", ">=", fromTimestamp!),
    );
}

function buildScoresQuery(input: EnvironmentsQueryInput) {
  const db = getClickhouseKysely();
  const { projectId, fromTimestamp } = input;

  return db
    .selectFrom("scores")
    .select("environment")
    .distinct()
    .where("project_id", "=", projectId)
    .where("data_type", "in", [...LISTABLE_SCORE_TYPES])
    .$if(fromTimestamp != null, (qb) =>
      qb.where("timestamp", ">=", fromTimestamp!),
    );
}
