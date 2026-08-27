import type { ClickhouseCompilable } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { mapKeys, mapValues, withArrayJoin, withLimitBy } from "./extensions";

export type CatalogTier = 0 | 1 | 2 | 3 | 4;

export type CatalogEntry = {
  id: string;
  tier: CatalogTier;
  /** Hand-written reference SQL the compiler must match after `clickhouse format`. */
  referenceSql: string;
  build: () => ClickhouseCompilable;
};

const PROJECT_ID = "golden-project";
const FROM_TS = new Date("2026-01-01T00:00:00.000Z");

function db() {
  return getClickhouseKysely();
}

/**
 * Catalog of reference query shapes, one entry per complexity tier.
 * Reference SQL is the intended ClickHouse shape, not a dump of Kysely's
 * first draft — `compile(AST) ≡ referenceSQL` after `clickhouse format`.
 */
export const CATALOG: CatalogEntry[] = [
  {
    id: "environments_events_core",
    tier: 0,
    referenceSql: `
      SELECT DISTINCT environment
      FROM events_core
      WHERE project_id = {p1:String}
    `,
    build: () =>
      db()
        .selectFrom("events_core")
        .select("environment")
        .distinct()
        .where("project_id", "=", PROJECT_ID),
  },
  {
    id: "environments_legacy_union",
    tier: 0,
    referenceSql: `
      SELECT DISTINCT environment
      FROM traces
      WHERE project_id = {p1:String}
      UNION ALL
      SELECT DISTINCT environment
      FROM observations
      WHERE project_id = {p1:String}
    `,
    build: () =>
      db()
        .selectFrom("traces")
        .select("environment")
        .distinct()
        .where("project_id", "=", PROJECT_ID)
        .unionAll(
          db()
            .selectFrom("observations")
            .select("environment")
            .distinct()
            .where("project_id", "=", PROJECT_ID),
        ),
  },
  {
    id: "environments_scores_in_array",
    tier: 0,
    referenceSql: `
      SELECT DISTINCT environment
      FROM scores
      WHERE (project_id = {p1:String}) AND (data_type IN ({p2:Array(String)}))
    `,
    build: () =>
      db()
        .selectFrom("scores")
        .select("environment")
        .distinct()
        .where("project_id", "=", PROJECT_ID)
        .where("data_type", "in", [
          "NUMERIC",
          "BOOLEAN",
          "CATEGORICAL",
          "TEXT",
        ]),
  },
  {
    id: "events_core_time_bound",
    tier: 1,
    referenceSql: `
      SELECT DISTINCT environment
      FROM events_core
      WHERE (project_id = {p1:String}) AND (start_time >= {p2:DateTime64(3)})
    `,
    build: () =>
      db()
        .selectFrom("events_core")
        .select("environment")
        .distinct()
        .where("project_id", "=", PROJECT_ID)
        .where("start_time", ">=", FROM_TS),
  },
  {
    id: "group_by_count",
    tier: 1,
    referenceSql: `
      SELECT environment, count(*) AS n
      FROM events_core
      WHERE project_id = {p1:String}
      GROUP BY environment
    `,
    build: () =>
      db()
        .selectFrom("events_core")
        .select((eb) => ["environment", eb.fn.countAll().as("n")])
        .where("project_id", "=", PROJECT_ID)
        .groupBy("environment"),
  },
  {
    id: "join_observations_traces",
    tier: 2,
    referenceSql: `
      SELECT o.environment
      FROM observations AS o
      INNER JOIN traces AS t ON (o.trace_id = t.id) AND (o.project_id = t.project_id) AND (t.project_id = {p1:String})
      WHERE o.project_id = {p1:String}
    `,
    build: () =>
      db()
        .selectFrom("observations as o")
        .innerJoin("traces as t", (join) =>
          join
            .onRef("o.trace_id", "=", "t.id")
            .onRef("o.project_id", "=", "t.project_id"),
        )
        .select("o.environment")
        .where("o.project_id", "=", PROJECT_ID),
  },
  {
    id: "cte_trace_ids",
    tier: 2,
    referenceSql: `
      WITH traces_cte AS (
        SELECT id
        FROM traces
        WHERE project_id = {p1:String}
      )
      SELECT o.environment
      FROM observations AS o
      WHERE (o.project_id = {p1:String}) AND (o.trace_id IN (
        SELECT id
        FROM traces_cte
      ))
    `,
    build: () =>
      db()
        .with("traces_cte", (qb) =>
          qb
            .selectFrom("traces")
            .select("id")
            .where("project_id", "=", PROJECT_ID),
        )
        .selectFrom("observations as o")
        .select("o.environment")
        .where("o.project_id", "=", PROJECT_ID)
        .where("o.trace_id", "in", (eb) =>
          eb.selectFrom("traces_cte").select("id"),
        ),
  },
  {
    id: "array_join_cost_details",
    tier: 3,
    referenceSql: `
      SELECT environment
      FROM observations
      ARRAY JOIN mapKeys(cost_details) AS cost_key, mapValues(cost_details) AS cost
      WHERE project_id = {p1:String}
    `,
    build: () =>
      withArrayJoin(
        db()
          .selectFrom("observations")
          .select("environment")
          .where("project_id", "=", PROJECT_ID),
        [
          { expression: mapKeys("cost_details"), as: "cost_key" },
          { expression: mapValues("cost_details"), as: "cost" },
        ],
      ),
  },
  {
    id: "limit_by_dedup",
    tier: 3,
    referenceSql: `
      SELECT span_id, project_id
      FROM events_core
      WHERE project_id = {p1:String}
      ORDER BY event_ts DESC
      LIMIT 1 BY span_id, project_id
    `,
    build: () =>
      withLimitBy(
        db()
          .selectFrom("events_core")
          .select(["span_id", "project_id"])
          .where("project_id", "=", PROJECT_ID)
          .orderBy("event_ts", "desc"),
        { count: 1, columns: ["span_id", "project_id"] },
      ),
  },
  {
    id: "window_rank",
    tier: 4,
    referenceSql: `
      SELECT span_id, rank() OVER (PARTITION BY trace_id ORDER BY start_time DESC) AS rk
      FROM events_core
      WHERE project_id = {p1:String}
    `,
    build: () =>
      db()
        .selectFrom("events_core")
        .select((eb) => [
          "span_id",
          eb.fn
            .agg("rank")
            .over((ob) =>
              ob.partitionBy("trace_id").orderBy("start_time", "desc"),
            )
            .as("rk"),
        ])
        .where("project_id", "=", PROJECT_ID),
  },
];

export const CATALOG_PROJECT_ID = PROJECT_ID;
