import { type FilterState } from "../../../types";
import { type ScoreSourceType } from "../../../domain/scores";
import { greptimeQuery } from "../../greptime/client";
import { quoteIdent } from "../../greptime/schemaUtils";
import { greptimeInClause, greptimeTsParam, notDeleted } from "./queryHelpers";
import { greptimeDate } from "../../greptime/sql/rowContract";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `dataset_run_items` dedup CTE body (latest physical row per logical (run,item) key). GreptimeDB has
 * no QUALIFY, so the ROW_NUMBER rank is filtered in an outer `WHERE rn = 1`. Mirrors the contract in
 * `datasetRunItems.ts` (re-declared here to avoid exporting the module-private helper).
 */
const driDedupCte = (cols: readonly string[], whereSql: string): string =>
  `SELECT ${cols.map((c) => quoteIdent(c)).join(", ")} FROM (` +
  `SELECT ${cols.map((c) => quoteIdent(c)).join(", ")}, ROW_NUMBER() OVER (` +
  `PARTITION BY ${quoteIdent("project_id")}, ${quoteIdent("dataset_id")}, ` +
  `${quoteIdent("dataset_run_id")}, ${quoteIdent("dataset_item_id")} ` +
  `ORDER BY ${quoteIdent("created_at")} DESC) AS rn ` +
  `FROM ${quoteIdent("dataset_run_items")} WHERE ${whereSql}) d WHERE d.rn = 1`;

// Unit-separator delimiter for array_to_string(array_agg(...)) (mysql2 returns array_agg
// as a bracket-string, not JSON; a control char is robust against commas in score values).
const VALUE_SEP = String.fromCharCode(1);

/**
 * GreptimeDB experiment reads (04-read-path.md, P4). An experiment IS a dataset run:
 * `experiment_id == dataset_run_id`, `experiment_item_id == dataset_run_items.dataset_item_id`,
 * `experiment_item_root_span_id == dataset_run_items.observation_id`, and experiment name/description/
 * dataset_id/metadata are denormalized onto `dataset_run_items`. The CH `*FromEvents` readers (which
 * read the `events_*` event-log tables) collapse onto the merged `dataset_run_items` + traces/
 * observations/scores projections here.
 */

const COMPARISON_OPS: Record<string, string> = {
  ">": ">",
  ">=": ">=",
  "<": "<",
  "<=": "<=",
  "=": "=",
};

/**
 * Distinct dataset ids that have experiment (dataset-run) data, optionally bounded by a start-time
 * filter. Replaces the experiments-filterOptions use of `getEventsGroupedByExperimentDatasetId`
 * (`experiment_dataset_id == dataset_id`). The shared events-table function keeps its generic
 * event-filter semantics for the v4 events filter-options path (deferred); this dedicated reader only
 * serves the experiments UI, which uses membership (and an optional Start Time bound) — not the full
 * event filter.
 */
export const getExperimentDatasetIdsGreptime = async (
  projectId: string,
  startTimeFilter?: FilterState,
): Promise<{ experimentDatasetId: string }[]> => {
  const clauses: string[] = [
    "project_id = :projectId",
    `dataset_id IS NOT NULL`,
    `dataset_id != ''`,
    notDeleted(),
  ];
  const params: Record<string, unknown> = { projectId };

  (startTimeFilter ?? []).forEach((f, i) => {
    if (f.type !== "datetime" || !(f.value instanceof Date)) return;
    const op = COMPARISON_OPS[f.operator];
    if (!op) return;
    const key = `st${i}`;
    params[key] = greptimeTsParam(f.value);
    clauses.push(`${quoteIdent("dataset_run_created_at")} ${op} :${key}`);
  });

  const rows = await greptimeQuery<{ experiment_dataset_id: string }>({
    query: `
      SELECT DISTINCT dataset_id AS experiment_dataset_id
      FROM ${quoteIdent("dataset_run_items")}
      WHERE ${clauses.join(" AND ")}
      LIMIT 1000`,
    params,
    readOnly: true,
  });

  return rows.map((r) => ({ experimentDatasetId: r.experiment_dataset_id }));
};

/**
 * Distinct experiment names with one representative id, for the experiment selector dropdown.
 * Replaces `getExperimentNamesFromEvents` (events `experiment_name`/`experiment_id`) with
 * `dataset_run_items.dataset_run_name`/`dataset_run_id`. Fan-out collapses under GROUP BY name, so no
 * dedup is needed (any_value picks a valid run id for the name).
 */
export const getExperimentNamesGreptime = async (props: {
  projectId: string;
}): Promise<{ experimentName: string; experimentId: string }[]> => {
  const rows = await greptimeQuery<{
    experimentName: string;
    experimentId: string;
  }>({
    query: `
      SELECT ${quoteIdent("dataset_run_name")} AS ${quoteIdent("experimentName")},
        min(${quoteIdent("dataset_run_id")}) AS ${quoteIdent("experimentId")}
      FROM ${quoteIdent("dataset_run_items")}
      WHERE project_id = :projectId AND ${notDeleted()}
        AND ${quoteIdent("dataset_run_name")} IS NOT NULL
        AND ${quoteIdent("dataset_run_name")} != ''
      GROUP BY ${quoteIdent("dataset_run_name")}
      LIMIT 1000`,
    params: { projectId: props.projectId },
    readOnly: true,
  });
  return rows.map((r) => ({
    experimentName: r.experimentName,
    experimentId: r.experimentId,
  }));
};

/**
 * Per-experiment (== dataset run) total cost + average root-span latency. Replaces
 * `getExperimentMetricsFromEvents` (events `SUM(total_cost)` over all spans, `avgIf` root-span
 * latency). total_cost is summed per run over its DISTINCT traces (a trace's observations are summed
 * once even if multiple items share the trace), latency is the average of each item's ROOT observation
 * duration. Observations are scanned in a ±1-day window around the runs' creation span (same bound as
 * the migrated dataset-runs metrics path).
 */
export const getExperimentMetricsGreptime = async (props: {
  projectId: string;
  experimentIds: string[];
}): Promise<
  { id: string; totalCost: number | null; latencyAvg: number | null }[]
> => {
  const { projectId, experimentIds } = props;
  if (experimentIds.length === 0) return [];
  const runs = greptimeInClause("dataset_run_id", experimentIds, "run");

  const bounds = await greptimeQuery<{ lo: Date | null; hi: Date | null }>({
    query: `SELECT min(${quoteIdent("dataset_run_created_at")}) AS lo,
        max(${quoteIdent("dataset_run_created_at")}) AS hi
      FROM ${quoteIdent("dataset_run_items")}
      WHERE project_id = :projectId AND ${runs.sql} AND ${notDeleted()}`,
    params: { projectId, ...runs.params },
    readOnly: true,
  });
  const lo = greptimeDate(bounds[0]?.lo);
  const hi = greptimeDate(bounds[0]?.hi);
  if (!lo || !hi) return [];
  const obsLo = greptimeTsParam(new Date(lo.getTime() - ONE_DAY_MS));
  const obsHi = greptimeTsParam(new Date(hi.getTime() + ONE_DAY_MS));

  const rows = await greptimeQuery<{
    experiment_id: string;
    total_cost: string | number | null;
    latency_avg: string | number | null;
  }>({
    query: `
      WITH dri_dedup AS (
        SELECT dataset_run_id, trace_id, observation_id FROM (
          SELECT dataset_run_id, trace_id, observation_id,
            ROW_NUMBER() OVER (PARTITION BY ${quoteIdent("project_id")}, ${quoteIdent("dataset_id")},
              ${quoteIdent("dataset_run_id")}, ${quoteIdent("dataset_item_id")}
              ORDER BY ${quoteIdent("created_at")} DESC) AS rn
          FROM ${quoteIdent("dataset_run_items")}
          WHERE project_id = :projectId AND ${runs.sql} AND ${notDeleted()}
        ) d WHERE d.rn = 1
      ),
      obs_cost AS (
        SELECT trace_id, sum(total_cost) AS tcost
        FROM observations
        WHERE project_id = :projectId AND start_time >= :obsLo AND start_time <= :obsHi
          AND ${notDeleted()}
          AND trace_id IN (SELECT trace_id FROM dri_dedup)
        GROUP BY trace_id
      ),
      run_cost AS (
        SELECT d.dataset_run_id, sum(oc.tcost) AS total_cost
        FROM (SELECT DISTINCT dataset_run_id, trace_id FROM dri_dedup) d
        LEFT JOIN obs_cost oc ON oc.trace_id = d.trace_id
        GROUP BY d.dataset_run_id
      ),
      root_latency AS (
        SELECT d.dataset_run_id,
          avg(CAST((to_unixtime(o.end_time) - to_unixtime(o.start_time)) * 1000 AS BIGINT)) AS latency_avg
        FROM dri_dedup d
        JOIN observations o ON o.id = d.observation_id AND o.project_id = :projectId
          AND o.start_time >= :obsLo AND o.start_time <= :obsHi AND o.end_time IS NOT NULL
          AND ${notDeleted("o")}
        GROUP BY d.dataset_run_id
      )
      SELECT rc.dataset_run_id AS experiment_id, rc.total_cost AS total_cost,
        rl.latency_avg AS latency_avg
      FROM run_cost rc
      LEFT JOIN root_latency rl ON rl.dataset_run_id = rc.dataset_run_id`,
    params: { projectId, ...runs.params, obsLo, obsHi },
    readOnly: true,
  });

  return rows.map((r) => ({
    id: r.experiment_id,
    totalCost: r.total_cost == null ? null : Number(r.total_cost),
    latencyAvg: r.latency_avg == null ? null : Number(r.latency_avg),
  }));
};

// ---------------------------------------------------------------------------
// experiment score filter options (scores reachable from a run's items)
// ---------------------------------------------------------------------------

export type ExperimentScoreOptionRow = {
  name: string;
  source: ScoreSourceType;
  data_type: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  values: string[];
};

const ALLOWED_SCORE_DATA_TYPES = "'NUMERIC', 'CATEGORICAL', 'BOOLEAN'";
const SCORE_CATEGORICAL_VALUE_LIMIT = 20;

const parseOptionRows = (
  rows: {
    name: string;
    source: string;
    data_type: string;
    values_raw: string | null;
  }[],
): ExperimentScoreOptionRow[] =>
  rows.map((r) => ({
    name: r.name,
    source: r.source as ScoreSourceType,
    data_type: r.data_type as ExperimentScoreOptionRow["data_type"],
    values: (r.values_raw ? r.values_raw.split(VALUE_SEP) : [])
      .filter((v) => v !== "")
      .slice(0, SCORE_CATEGORICAL_VALUE_LIMIT),
  }));

/**
 * Score filter options at the experiment-ITEM grain (trace- or observation-level), gathered from the
 * scores attached to the runs' items. Replaces the CH `buildScoreFilterOptionsQuery` (events root-span
 * join). `run_keys` = deduped DRI (trace_id [+ root observation_id]) for the given experiment ids; the
 * DISTINCT key collapses DRI fan-out before the scores join.
 */
export const getExperimentItemScoreOptionsGreptime = async (params: {
  projectId: string;
  experimentIds: string[];
  level: "trace" | "observation";
}): Promise<ExperimentScoreOptionRow[]> => {
  const { projectId, experimentIds, level } = params;
  if (experimentIds.length === 0) return [];
  const runs = greptimeInClause("dataset_run_id", experimentIds, "run");
  const scope = `project_id = :projectId AND ${runs.sql} AND ${notDeleted()}`;
  const runKeys = driDedupCte(["trace_id", "observation_id"], scope);
  const join =
    level === "observation"
      ? `s.trace_id = k.trace_id AND s.observation_id = k.observation_id ` +
        `AND s.observation_id IS NOT NULL AND s.observation_id != ''`
      : `s.trace_id = k.trace_id AND (s.observation_id IS NULL OR s.observation_id = '')`;

  const rows = await greptimeQuery<{
    name: string;
    source: string;
    data_type: string;
    values_raw: string | null;
  }>({
    query: `
      WITH run_keys AS (${runKeys})
      SELECT s.${quoteIdent("name")} AS name, s.source AS source, s.data_type AS data_type,
        array_to_string(array_agg(DISTINCT s.string_value), :sep) AS values_raw
      FROM (SELECT DISTINCT trace_id, observation_id FROM run_keys) k
      JOIN scores s ON s.project_id = :projectId AND ${join} AND ${notDeleted("s")}
      WHERE s.data_type IN (${ALLOWED_SCORE_DATA_TYPES})
      GROUP BY s.${quoteIdent("name")}, s.source, s.data_type
      ORDER BY s.${quoteIdent("name")}
      LIMIT 1000`,
    params: { projectId, ...runs.params, sep: VALUE_SEP },
    readOnly: true,
  });
  return parseOptionRows(rows);
};

/**
 * Score filter options at the experiment-RUN grain: scores attached directly to the dataset run
 * (`scores.dataset_run_id`). Replaces the CH `buildExperimentRunScoreFilterOptionsQuery`.
 */
export const getExperimentRunScoreOptionsGreptime = async (params: {
  projectId: string;
  experimentIds: string[];
}): Promise<ExperimentScoreOptionRow[]> => {
  const { projectId, experimentIds } = params;
  if (experimentIds.length === 0) return [];
  const runs = greptimeInClause("dataset_run_id", experimentIds, "run");
  const rows = await greptimeQuery<{
    name: string;
    source: string;
    data_type: string;
    values_raw: string | null;
  }>({
    query: `
      SELECT ${quoteIdent("name")} AS name, source AS source, data_type AS data_type,
        array_to_string(array_agg(DISTINCT string_value), :sep) AS values_raw
      FROM scores
      WHERE project_id = :projectId AND ${runs.sql}
        AND data_type IN (${ALLOWED_SCORE_DATA_TYPES}) AND ${notDeleted()}
      GROUP BY ${quoteIdent("name")}, source, data_type
      ORDER BY ${quoteIdent("name")}
      LIMIT 1000`,
    params: { projectId, ...runs.params, sep: VALUE_SEP },
    readOnly: true,
  });
  return parseOptionRows(rows);
};
