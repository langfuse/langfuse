import { env } from "../../env";
import { compile } from "../query-ast/hypequery/compile";
import {
  buildScoreEnvironmentsPlan,
  buildTracingEnvironmentsPlan,
} from "../query-ast/hypequery/environmentsQuery";
import { queryClickhouse } from "./clickhouse";

export type EnvironmentFilterProps = {
  projectId: string;
  fromTimestamp?: Date;
};

export const getEnvironmentsForProject = async (
  props: EnvironmentFilterProps,
): Promise<{ environment: string }[]> => {
  const { projectId, fromTimestamp } = props;
  const ctx = { projectId };

  const tracing = compile(
    buildTracingEnvironmentsPlan({
      writeMode: env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
      fromTimestamp,
    }),
    ctx,
  );

  // In dual and events_only write modes all tracing data lands in the events
  // tables: a single events_core scan covers traces and observations and is
  // the only populated source under events_only. Scores keep their own table
  // in every write mode. The events read may be routed to a dedicated
  // ClickHouse service (CLICKHOUSE_EVENTS_READ_ONLY_URL), so it cannot share
  // a query with the scores read.
  const tracingEnvironmentsPromise = queryClickhouse<{ environment: string }>({
    query: tracing.sql,
    params: tracing.params,
    tags: { projectId, route: "environments.getEnvironmentsForProject" },
    preferredClickhouseService:
      env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy"
        ? "ReadOnly"
        : "EventsReadOnly",
  });

  const scores = compile(buildScoreEnvironmentsPlan(fromTimestamp), ctx);
  const scoreEnvironmentsPromise = queryClickhouse<{ environment: string }>({
    query: scores.sql,
    params: scores.params,
    tags: { projectId, route: "environments.getEnvironmentsForProject" },
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
