import { type FilterState } from "../../../types";
import { greptimeQuery } from "../../greptime/client";
import { quoteIdent } from "../../greptime/schemaUtils";
import { greptimeInClause, greptimeTsParam, notDeleted } from "./queryHelpers";
import { greptimeDate } from "../../greptime/sql/rowContract";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
