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

export const getEnvironmentsForProject = async (
  props: EnvironmentFilterProps,
): Promise<{ environment: string }[]> => {
  const { projectId, fromTimestamp } = props;
  const writeMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
  const db = getClickhouseKysely();
  // Tenancy is applied at compile time: compileClickhouseQuery injects
  // `project_id = {projectId}` into every tenanted relation and refuses to
  // compile an unscoped query, so the query bodies below carry no project_id
  // filter of their own.
  const ctx: ExecutionContext = { projectId };

  // In dual/events_only write modes all tracing data lands in events_core (the
  // only populated source under events_only), so one scan covers traces and
  // observations. Legacy still reads the two separate tables and unions them.
  const tracingQuery =
    writeMode === "legacy"
      ? db
          .selectFrom("traces")
          .select("environment")
          .distinct()
          .$if(fromTimestamp != null, (qb) =>
            qb.where("timestamp", ">=", fromTimestamp!),
          )
          .unionAll(
            db
              .selectFrom("observations")
              .select("environment")
              .distinct()
              .$if(fromTimestamp != null, (qb) =>
                qb.where("start_time", ">=", fromTimestamp!),
              ),
          )
      : db
          .selectFrom("events_core")
          .select("environment")
          .distinct()
          .$if(fromTimestamp != null, (qb) =>
            qb.where("start_time", ">=", fromTimestamp!),
          );

  const scoresQuery = db
    .selectFrom("scores")
    .select("environment")
    .distinct()
    .where("data_type", "in", [...LISTABLE_SCORE_TYPES])
    .$if(fromTimestamp != null, (qb) =>
      qb.where("timestamp", ">=", fromTimestamp!),
    );

  const tracing = compileClickhouseQuery(tracingQuery, ctx);
  const scores = compileClickhouseQuery(scoresQuery, ctx);

  // The events read may route to a dedicated ClickHouse service
  // (CLICKHOUSE_EVENTS_READ_ONLY_URL) while scores always read the primary, so
  // the two cannot share one query.
  const tracingEnvironmentsPromise = queryClickhouse<{ environment: string }>({
    query: tracing.sql,
    params: tracing.params,
    tags: { projectId, route: "environments.getEnvironmentsForProject" },
    preferredClickhouseService:
      writeMode === "legacy" ? "ReadOnly" : "EventsReadOnly",
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

  // "default" always exists as a selectable environment even when no rows have
  // been written under it, so it is not guaranteed to appear in the scan.
  results.push({ environment: "default" });

  return Array.from(new Set(results.map((e) => e.environment))).map(
    (environment) => ({
      environment,
    }),
  );
};
