import { table } from "./db";
import { selectPlan, type QueryPlan } from "./plan";
import {
  buildScoreEnvironmentsPlan,
  buildTracingEnvironmentsPlan,
} from "./environmentsQuery";

export type CatalogSample = {
  id: string;
  description: string;
  plan: QueryPlan;
  referenceSql: string;
};

const PROJECT = "{projectId:String}";
const FROM_TS = "{fromTimestamp:DateTime64(3)}";
const DATA_TYPES = "{dataTypes:Array(String)}";

/**
 * Frozen catalog sample for this arm. Each entry is a real hypequery (or
 * union-all wrapper) plan plus the reference SQL it must compile to after
 * `clickhouse format`. Environment queries are the golden-harness set;
 * ARRAY JOIN / LIMIT BY / PREWHERE / WITH TOTALS are the CH-native extras.
 */
export function buildCatalog(fromTimestamp: Date): CatalogSample[] {
  return [
    {
      id: "env-events-unbounded",
      description: "events_core distinct environments, no time bound",
      plan: buildTracingEnvironmentsPlan({ writeMode: "events_only" }),
      referenceSql: `SELECT DISTINCT environment FROM events_core WHERE project_id = ${PROJECT}`,
    },
    {
      id: "env-events-bounded",
      description: "events_core distinct environments with start_time bound",
      plan: buildTracingEnvironmentsPlan({
        writeMode: "events_only",
        fromTimestamp,
      }),
      referenceSql: `SELECT DISTINCT environment FROM events_core WHERE project_id = ${PROJECT} AND start_time >= ${FROM_TS}`,
    },
    {
      id: "env-legacy-unbounded",
      description: "legacy traces UNION ALL observations",
      plan: buildTracingEnvironmentsPlan({ writeMode: "legacy" }),
      referenceSql: `SELECT DISTINCT environment FROM traces WHERE project_id = ${PROJECT} UNION ALL SELECT DISTINCT environment FROM observations WHERE project_id = ${PROJECT}`,
    },
    {
      id: "env-legacy-bounded",
      description: "legacy traces UNION ALL observations with time bounds",
      plan: buildTracingEnvironmentsPlan({
        writeMode: "legacy",
        fromTimestamp,
      }),
      referenceSql: `SELECT DISTINCT environment FROM traces WHERE project_id = ${PROJECT} AND timestamp >= ${FROM_TS} UNION ALL SELECT DISTINCT environment FROM observations WHERE project_id = ${PROJECT} AND start_time >= ${FROM_TS}`,
    },
    {
      id: "env-scores-unbounded",
      description: "scores distinct environments, listable types",
      plan: buildScoreEnvironmentsPlan(),
      referenceSql: `SELECT DISTINCT environment FROM scores WHERE project_id = ${PROJECT} AND data_type IN (${DATA_TYPES})`,
    },
    {
      id: "env-scores-bounded",
      description: "scores distinct environments with timestamp bound",
      plan: buildScoreEnvironmentsPlan(fromTimestamp),
      referenceSql: `SELECT DISTINCT environment FROM scores WHERE project_id = ${PROJECT} AND data_type IN (${DATA_TYPES}) AND timestamp >= ${FROM_TS}`,
    },
    {
      id: "array-join-tags",
      description: "ARRAY JOIN is a kind-tagged node, not a raw SQL fragment",
      plan: selectPlan(table("events_core").select(["tags"]).arrayJoin("tags")),
      referenceSql: `SELECT tags FROM events_core ARRAY JOIN tags WHERE project_id = ${PROJECT}`,
    },
    {
      id: "limit-by-span",
      description: "LIMIT BY is a kind-tagged node, not a raw SQL fragment",
      plan: selectPlan(
        table("events_core")
          .select(["span_id", "project_id"])
          .orderBy("start_time", "DESC")
          .limitBy(1, ["span_id", "project_id"]),
      ),
      referenceSql: `SELECT span_id, project_id FROM events_core WHERE project_id = ${PROJECT} ORDER BY start_time DESC LIMIT 1 BY span_id, project_id`,
    },
    {
      id: "prewhere-not-deleted",
      description: "PREWHERE is a real clause node on the select tree",
      plan: selectPlan(
        table("events_core")
          .select(["span_id"])
          .prewhere("is_deleted", "eq", 0),
      ),
      referenceSql: `SELECT span_id FROM events_core PREWHERE is_deleted = {isDeleted:UInt8} WHERE project_id = ${PROJECT}`,
    },
    {
      id: "group-by-with-totals",
      description: "GROUP BY ... WITH TOTALS is a node flag, not raw SQL",
      plan: selectPlan(
        table("events_core")
          .select(["environment"])
          .count("span_id", "spans")
          .groupBy("environment")
          .withTotals(),
      ),
      referenceSql: `SELECT environment, COUNT(span_id) AS spans FROM events_core WHERE project_id = ${PROJECT} GROUP BY environment WITH TOTALS`,
    },
  ];
}
