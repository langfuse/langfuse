import { type FilterState } from "../../../types";
import { type ScoreSourceType } from "../../../domain/scores";
import { InvalidRequestError } from "../../../errors";
import { greptimeQuery } from "../../greptime/client";
import { quoteIdent } from "../../greptime/schemaUtils";
import { greptimeInClause, greptimeTsParam, notDeleted } from "./queryHelpers";
import { greptimeDate } from "../../greptime/sql/rowContract";
import { FilterList } from "../../greptime/sql/greptime-filter";
import { createGreptimeFilterFromFilterState } from "../../greptime/sql/factory";
import {
  experimentsListGreptimeColumnDefinitions,
  experimentItemsGreptimeColumnDefinitions,
} from "../../greptime/sql/datasetColumnMappings";
import { escapeSqlLikePattern } from "../../utils/sqlLike";
import { parseMetadataCHRecordToDomain } from "../../utils/metadata_conversion";

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
  // Stable tiebreakers so dedup is deterministic when two rows share created_at.
  `ORDER BY ${quoteIdent("created_at")} DESC, ${quoteIdent("updated_at")} DESC, ${quoteIdent("id")} DESC) AS rn ` +
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
): Promise<{ experimentDatasetId: string; count: number }[]> => {
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

  const rows = await greptimeQuery<{
    experiment_dataset_id: string;
    count: string | number;
  }>({
    query: `
      SELECT dataset_id AS experiment_dataset_id, count(*) AS count
      FROM ${quoteIdent("dataset_run_items")}
      WHERE ${clauses.join(" AND ")}
      GROUP BY dataset_id
      ORDER BY count(*) DESC, dataset_id ASC
      LIMIT 1000`,
    params,
    readOnly: true,
  });

  return rows.map((r) => ({
    experimentDatasetId: r.experiment_dataset_id,
    count: Number(r.count),
  }));
};

export const getExperimentIdsGreptime = async (props: {
  projectId: string;
}): Promise<{ experimentId: string; count: number }[]> => {
  const rows = await greptimeQuery<{
    experimentId: string;
    count: string | number;
  }>({
    query: `
      SELECT ${quoteIdent("dataset_run_id")} AS ${quoteIdent("experimentId")},
        count(*) AS count
      FROM ${quoteIdent("dataset_run_items")}
      WHERE project_id = :projectId AND ${notDeleted()}
        AND ${quoteIdent("dataset_run_id")} IS NOT NULL
        AND ${quoteIdent("dataset_run_id")} != ''
      GROUP BY ${quoteIdent("dataset_run_id")}
      ORDER BY count(*) DESC, ${quoteIdent("dataset_run_id")} ASC
      LIMIT 1000`,
    params: { projectId: props.projectId },
    readOnly: true,
  });
  return rows.map((r) => ({
    experimentId: r.experimentId,
    count: Number(r.count),
  }));
};

/**
 * Distinct experiment names with one representative id, for the experiment selector dropdown.
 * Replaces `getExperimentNamesFromEvents` (events `experiment_name`/`experiment_id`) with
 * `dataset_run_items.dataset_run_name`/`dataset_run_id`. Fan-out collapses under GROUP BY name, so no
 * dedup is needed (any_value picks a valid run id for the name).
 */
export const getExperimentNamesGreptime = async (props: {
  projectId: string;
}): Promise<
  { experimentName: string; experimentId: string; count: number }[]
> => {
  const rows = await greptimeQuery<{
    experimentName: string;
    experimentId: string;
    count: string | number;
  }>({
    query: `
      SELECT ${quoteIdent("dataset_run_name")} AS ${quoteIdent("experimentName")},
        min(${quoteIdent("dataset_run_id")}) AS ${quoteIdent("experimentId")},
        count(*) AS count
      FROM ${quoteIdent("dataset_run_items")}
      WHERE project_id = :projectId AND ${notDeleted()}
        AND ${quoteIdent("dataset_run_name")} IS NOT NULL
        AND ${quoteIdent("dataset_run_name")} != ''
      GROUP BY ${quoteIdent("dataset_run_name")}
      ORDER BY count(*) DESC, ${quoteIdent("dataset_run_name")} ASC
      LIMIT 1000`,
    params: { projectId: props.projectId },
    readOnly: true,
  });
  return rows.map((r) => ({
    experimentName: r.experimentName,
    experimentId: r.experimentId,
    count: Number(r.count),
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
              ORDER BY ${quoteIdent("created_at")} DESC, ${quoteIdent("updated_at")} DESC, ${quoteIdent("id")} DESC) AS rn
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

// ---------------------------------------------------------------------------
// experiment items batch IO (input/output from root observation; expected from DRI)
// ---------------------------------------------------------------------------

const IO_TRUNCATE_LENGTH = 1000;
const truncate = (v: string | null): string | null =>
  v == null ? null : Array.from(v).slice(0, IO_TRUNCATE_LENGTH).join("");

/**
 * Per-(item, experiment) IO rows for the batch-compare view. Replaces `getExperimentItemsBatchIO`'s
 * events-root-span read: `input`/`output` come from the item's ROOT observation (matching the CH
 * `e.input`/`e.output` root-span semantics — NOT the DRI dataset_item_input), `expected_output` from
 * the DRI denormalized `dataset_item_expected_output`. Deduped DRI joined to the root observation by
 * `observation_id` is unique (no fan-out); the app-side fold (baseline preference) stays in the caller.
 */
export const getExperimentItemsBatchIORowsGreptime = async (params: {
  projectId: string;
  itemIds: string[];
  experimentIds: string[];
}): Promise<
  {
    item_id: string;
    experiment_id: string;
    input: string | null;
    output: string | null;
    expected_output: string | null;
  }[]
> => {
  const { projectId, itemIds, experimentIds } = params;
  if (itemIds.length === 0 || experimentIds.length === 0) return [];
  const runs = greptimeInClause("dataset_run_id", experimentIds, "run");
  const items = greptimeInClause("dataset_item_id", itemIds, "item");
  const scope = `project_id = :projectId AND ${runs.sql} AND ${items.sql} AND ${notDeleted()}`;
  const dedup = driDedupCte(
    [
      "dataset_item_id",
      "dataset_run_id",
      "trace_id",
      "observation_id",
      "dataset_item_expected_output",
    ],
    scope,
  );

  const bounds = await greptimeQuery<{ lo: Date | null; hi: Date | null }>({
    query: `SELECT min(${quoteIdent("dataset_run_created_at")}) AS lo,
        max(${quoteIdent("dataset_run_created_at")}) AS hi
      FROM ${quoteIdent("dataset_run_items")} WHERE ${scope}`,
    params: { projectId, ...runs.params, ...items.params },
    readOnly: true,
  });
  const lo = greptimeDate(bounds[0]?.lo);
  const hi = greptimeDate(bounds[0]?.hi);
  if (!lo || !hi) return [];
  const obsLo = greptimeTsParam(new Date(lo.getTime() - ONE_DAY_MS));
  const obsHi = greptimeTsParam(new Date(hi.getTime() + ONE_DAY_MS));

  const rows = await greptimeQuery<{
    item_id: string;
    experiment_id: string;
    input: string | null;
    output: string | null;
    expected_output: string | null;
  }>({
    query: `
      WITH dri_dedup AS (${dedup})
      SELECT dri.dataset_item_id AS item_id, dri.dataset_run_id AS experiment_id,
        o.input AS input, o.output AS output,
        dri.dataset_item_expected_output AS expected_output
      FROM dri_dedup dri
      LEFT JOIN observations o ON o.id = dri.observation_id AND o.project_id = :projectId
        AND o.trace_id = dri.trace_id AND o.start_time >= :obsLo AND o.start_time <= :obsHi
        AND ${notDeleted("o")}`,
    params: { projectId, ...runs.params, ...items.params, obsLo, obsHi },
    readOnly: true,
  });
  return rows.map((r) => ({
    item_id: r.item_id,
    experiment_id: r.experiment_id,
    input: truncate(r.input),
    output: truncate(r.output),
    expected_output: truncate(r.expected_output),
  }));
};

// ---------------------------------------------------------------------------
// experiments LIST (one row per dataset run, cross-dataset)
// ---------------------------------------------------------------------------

const PROMPT_FIELD_SEP = String.fromCharCode(2);

const SCORE_AGG_COLUMNS = new Set([
  "obs_scores_avg",
  "obs_score_categories",
  "trace_scores_avg",
  "trace_score_categories",
]);
const PRE_AGG_PLAIN_COLUMNS = new Set([
  "id",
  "name",
  "description",
  "experimentDatasetId",
  "startTime",
]);

export type ExperimentListRow = {
  id: string;
  name: string;
  description: string | null;
  datasetId: string;
  itemCount: number;
  errorCount: number;
  prompts: Array<[string, number | null]>;
  metadata: Record<string, string>;
  startTime: Date;
};

/** Translate the LIST `metadata` (stringObject) filters to JSON predicates over dataset_run_metadata. */
const buildListMetadataPredicate = (
  metadataFilters: FilterState,
): { sql: string; params: Record<string, unknown> } => {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  metadataFilters.forEach((f, i) => {
    if (f.type !== "stringObject") return;
    const k = `mk${i}`;
    const v = `mv${i}`;
    params[k] = f.key;
    const acc = `json_get_string(${quoteIdent("dataset_run_metadata")}, :${k})`;
    switch (f.operator) {
      case "=":
        params[v] = f.value;
        clauses.push(`${acc} = :${v}`);
        break;
      case "contains":
        params[v] = `%${escapeSqlLikePattern(f.value)}%`;
        clauses.push(`${acc} LIKE :${v}`);
        break;
      case "does not contain":
        params[v] = `%${escapeSqlLikePattern(f.value)}%`;
        clauses.push(`(${acc} IS NULL OR ${acc} NOT LIKE :${v})`);
        break;
      default:
        throw new InvalidRequestError(
          `Unsupported experiments metadata filter operator: ${f.operator}`,
        );
    }
  });
  return { sql: clauses.join(" AND "), params };
};

const NUMERIC_OPS = new Set([">", "<", ">=", "<=", "=", "!="]);

/**
 * Run-level score-aggregation filter for the LIST (correlated EXISTS over `scores` through the run's
 * traces in the `item_dedup` CTE). obs-level -> `observation_id IS NOT NULL`, trace-level -> `IS NULL`.
 */
const buildListScoreFilter = (
  scoreFilters: FilterState,
  outerPrefix: string,
): { sql: string; params: Record<string, unknown> } => {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  const traceCorr = `cs.${quoteIdent("trace_id")} IN (SELECT ${quoteIdent("trace_id")} FROM item_dedup WHERE ${quoteIdent("dataset_run_id")} = ${outerPrefix}.${quoteIdent("dataset_run_id")})`;
  scoreFilters.forEach((f, i) => {
    const isObs = f.column.startsWith("obs_");
    const obsPred = isObs
      ? `cs.${quoteIdent("observation_id")} IS NOT NULL AND cs.${quoteIdent("observation_id")} != ''`
      : `(cs.${quoteIdent("observation_id")} IS NULL OR cs.${quoteIdent("observation_id")} = '')`;
    const base = `SELECT 1 FROM ${quoteIdent("scores")} cs WHERE cs.${quoteIdent("project_id")} = :projectId AND ${traceCorr} AND ${obsPred} AND cs.${quoteIdent("is_deleted")} = false`;
    if (f.type === "numberObject") {
      if (!NUMERIC_OPS.has(f.operator)) {
        throw new InvalidRequestError(`Invalid score operator: ${f.operator}`);
      }
      const k = `lsk${i}`;
      const v = `lsv${i}`;
      params[k] = f.key;
      params[v] = f.value;
      clauses.push(
        `EXISTS (${base} AND cs.${quoteIdent("name")} = :${k} AND cs.${quoteIdent("data_type")} IN ('NUMERIC', 'BOOLEAN') GROUP BY cs.${quoteIdent("name")} HAVING avg(cs.${quoteIdent("value")}) ${f.operator} :${v})`,
      );
    } else if (f.type === "categoryOptions") {
      if (f.value.length === 0) {
        clauses.push(f.operator === "any of" ? "1 = 0" : "1 = 1");
        return;
      }
      const k = `lsk${i}`;
      params[k] = f.key;
      const placeholders = f.value.map((val, j) => {
        const name = `lscv${i}_${j}`;
        params[name] = val;
        return `:${name}`;
      });
      const negate = f.operator === "none of";
      clauses.push(
        `${negate ? "NOT EXISTS" : "EXISTS"} (${base} AND cs.${quoteIdent("name")} = :${k} AND cs.${quoteIdent("data_type")} = 'CATEGORICAL' AND cs.${quoteIdent("string_value")} IN (${placeholders.join(", ")}))`,
      );
    }
  });
  return { sql: clauses.join(" AND "), params };
};

const DEDUP_LIST_COLS = [
  "dataset_run_id",
  "dataset_id",
  "dataset_item_id",
  "dataset_run_name",
  "dataset_run_description",
  "dataset_run_created_at",
  "dataset_run_metadata",
  "trace_id",
] as const;

const parsePrompts = (raw: string | null): Array<[string, number | null]> => {
  if (!raw) return [];
  return raw
    .split(VALUE_SEP)
    .filter((t) => t !== "")
    .map((t) => {
      const [name, ver] = t.split(PROMPT_FIELD_SEP);
      const version =
        ver === "" || ver == null || ver === "null" ? null : Number(ver);
      return [name, version] as [string, number | null];
    });
};

const buildListCtes = (
  projectId: string,
  filter: FilterState,
): {
  ctes: string;
  scoreWhere: string;
  params: Record<string, unknown>;
  bounds: { scope: string; scopeParams: Record<string, unknown> };
} => {
  const plain = filter.filter((f) => PRE_AGG_PLAIN_COLUMNS.has(f.column));
  const metadata = filter.filter((f) => f.column === "metadata");
  const scoreAgg = filter.filter((f) => SCORE_AGG_COLUMNS.has(f.column));

  const plainFilter = new FilterList(
    createGreptimeFilterFromFilterState(
      plain,
      experimentsListGreptimeColumnDefinitions,
    ),
  ).apply();
  const metaPred = buildListMetadataPredicate(metadata);

  const innerWhere = [
    "project_id = :projectId",
    notDeleted(),
    plainFilter.query,
    metaPred.sql,
  ]
    .filter(Boolean)
    .join(" AND ");

  const score = buildListScoreFilter(scoreAgg, "ra");
  const params: Record<string, unknown> = {
    projectId,
    ...plainFilter.params,
    ...metaPred.params,
    ...score.params,
  };

  return {
    ctes: `
      item_dedup AS (${driDedupCte(DEDUP_LIST_COLS, innerWhere)}),
      run_agg AS (
        SELECT ${quoteIdent("dataset_run_id")},
          min(${quoteIdent("dataset_run_name")}) AS name,
          min(${quoteIdent("dataset_run_description")}) AS description,
          min(${quoteIdent("dataset_id")}) AS dataset_id,
          count(DISTINCT ${quoteIdent("dataset_item_id")}) AS item_count,
          min(${quoteIdent("dataset_run_created_at")}) AS run_created_at,
          min(json_to_string(${quoteIdent("dataset_run_metadata")})) AS metadata_json
        FROM item_dedup GROUP BY ${quoteIdent("dataset_run_id")}
      ),
      obs_err AS (
        SELECT d.${quoteIdent("dataset_run_id")} AS dataset_run_id,
          sum(CASE WHEN o.${quoteIdent("level")} = 'ERROR' THEN 1 ELSE 0 END) AS error_count,
          min(o.${quoteIdent("start_time")}) AS obs_start,
          array_to_string(array_agg(DISTINCT CASE WHEN o.${quoteIdent("prompt_name")} IS NOT NULL AND o.${quoteIdent("prompt_name")} != '' THEN concat(o.${quoteIdent("prompt_name")}, :pfsep, CAST(o.${quoteIdent("prompt_version")} AS STRING)) END), :vsep) AS prompts_raw
        FROM (SELECT DISTINCT ${quoteIdent("dataset_run_id")}, ${quoteIdent("trace_id")} FROM item_dedup) d
        JOIN observations o ON o.${quoteIdent("project_id")} = :projectId AND o.${quoteIdent("trace_id")} = d.${quoteIdent("trace_id")}
          AND o.${quoteIdent("start_time")} >= :obsLo AND o.${quoteIdent("start_time")} <= :obsHi AND o.${quoteIdent("is_deleted")} = false
        GROUP BY d.${quoteIdent("dataset_run_id")}
      )`,
    scoreWhere: score.sql ? `WHERE ${score.sql}` : "",
    params,
    bounds: {
      scope: innerWhere,
      scopeParams: { projectId, ...plainFilter.params, ...metaPred.params },
    },
  };
};

const computeListBounds = async (
  scope: string,
  scopeParams: Record<string, unknown>,
): Promise<{ obsLo: string; obsHi: string } | null> => {
  const bounds = await greptimeQuery<{ lo: Date | null; hi: Date | null }>({
    query: `SELECT min(${quoteIdent("dataset_run_created_at")}) AS lo, max(${quoteIdent("dataset_run_created_at")}) AS hi
      FROM ${quoteIdent("dataset_run_items")} WHERE ${scope}`,
    params: scopeParams,
    readOnly: true,
  });
  const lo = greptimeDate(bounds[0]?.lo);
  const hi = greptimeDate(bounds[0]?.hi);
  if (!lo || !hi) return null;
  return {
    obsLo: greptimeTsParam(new Date(lo.getTime() - ONE_DAY_MS)),
    obsHi: greptimeTsParam(new Date(hi.getTime() + ONE_DAY_MS)),
  };
};

export const getExperimentsListGreptime = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: { column: string; order: "ASC" | "DESC" } | null;
  limit?: number;
  page?: number;
}): Promise<ExperimentListRow[]> => {
  const { projectId, filter, orderBy, limit, page } = props;
  const { ctes, scoreWhere, params, bounds } = buildListCtes(projectId, filter);
  const b = await computeListBounds(bounds.scope, bounds.scopeParams);
  if (!b) return [];

  const dir = orderBy?.order === "ASC" ? "ASC" : "DESC";
  const pagination =
    limit !== undefined && page !== undefined
      ? `LIMIT ${Number(limit)} OFFSET ${Number(limit) * Number(page)}`
      : "";

  const rows = await greptimeQuery<{
    experiment_id: string;
    name: string | null;
    description: string | null;
    dataset_id: string;
    item_count: string | number;
    error_count: string | number | null;
    metadata_json: string | null;
    prompts_raw: string | null;
    start_time: Date;
  }>({
    query: `
      WITH ${ctes}
      SELECT ra.${quoteIdent("dataset_run_id")} AS experiment_id, ra.name AS name,
        ra.description AS description, ra.dataset_id AS dataset_id, ra.item_count AS item_count,
        ra.metadata_json AS metadata_json,
        COALESCE(oe.error_count, 0) AS error_count, oe.prompts_raw AS prompts_raw,
        COALESCE(oe.obs_start, ra.run_created_at) AS start_time
      FROM run_agg ra
      LEFT JOIN obs_err oe ON oe.dataset_run_id = ra.${quoteIdent("dataset_run_id")}
      ${scoreWhere}
      ORDER BY start_time ${dir}
      ${pagination}`,
    params: {
      ...params,
      obsLo: b.obsLo,
      obsHi: b.obsHi,
      pfsep: PROMPT_FIELD_SEP,
      vsep: VALUE_SEP,
    },
    readOnly: true,
  });

  return rows.map((r) => ({
    id: r.experiment_id,
    name: r.name ?? "",
    description: r.description,
    datasetId: r.dataset_id,
    itemCount: Number(r.item_count),
    errorCount: Number(r.error_count ?? 0),
    prompts: parsePrompts(r.prompts_raw),
    metadata:
      (parseMetadataCHRecordToDomain(
        r.metadata_json ? JSON.parse(r.metadata_json) : {},
      ) as Record<string, string>) ?? {},
    startTime: r.start_time,
  }));
};

export const getExperimentsListCountGreptime = async (props: {
  projectId: string;
  filter: FilterState;
}): Promise<number> => {
  const { projectId, filter } = props;
  const { ctes, scoreWhere, params, bounds } = buildListCtes(projectId, filter);
  const b = await computeListBounds(bounds.scope, bounds.scopeParams);
  if (!b) return 0;

  const rows = await greptimeQuery<{ count: string | number }>({
    query: `
      WITH ${ctes}
      SELECT count(*) AS count FROM (
        SELECT ra.${quoteIdent("dataset_run_id")}
        FROM run_agg ra
        ${scoreWhere}
      ) x`,
    params: {
      ...params,
      obsLo: b.obsLo,
      obsHi: b.obsHi,
      pfsep: PROMPT_FIELD_SEP,
      vsep: VALUE_SEP,
    },
    readOnly: true,
  });
  return Number(rows[0]?.count ?? 0);
};

// ---------------------------------------------------------------------------
// experiment items (qualification + per-(item,experiment) data)
// ---------------------------------------------------------------------------

const ITEM_SCORE_COLUMNS = new Set([
  "obs_scores_avg",
  "obs_score_categories",
  "trace_scores_avg",
  "trace_score_categories",
]);

type ExperimentItemInput = {
  projectId: string;
  baseExperimentId?: string;
  compExperimentIds: string[];
  filterByExperiment: { experimentId: string; filters: FilterState }[];
  config?: { requireBaselinePresence?: boolean };
};

/** Per-item-grain filter for one experiment (score-grain EXISTS + item/event metadata predicates). */
const buildItemGrainFilter = (
  filters: FilterState,
  alias: string,
  projectId: string,
  tag: string,
): { sql: string; params: Record<string, unknown> } => {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  const scoreFilters = filters.filter((f) => ITEM_SCORE_COLUMNS.has(f.column));
  if (scoreFilters.length > 0) {
    const compiled = new FilterList(
      createGreptimeFilterFromFilterState(
        scoreFilters,
        experimentItemsGreptimeColumnDefinitions,
      ),
    ).apply();
    if (compiled.query) {
      clauses.push(compiled.query);
      Object.assign(params, compiled.params);
    }
  }

  filters
    .filter((f) => f.column === "itemMetadata" && f.type === "stringObject")
    .forEach((f, i) => {
      if (f.type !== "stringObject") return;
      const k = `${tag}imk${i}`;
      const v = `${tag}imv${i}`;
      params[k] = f.key;
      const acc = `json_get_string(${alias}.${quoteIdent("dataset_item_metadata")}, :${k})`;
      if (f.operator === "=") {
        params[v] = f.value;
        clauses.push(`${acc} = :${v}`);
      } else if (f.operator === "contains") {
        params[v] = `%${escapeSqlLikePattern(f.value)}%`;
        clauses.push(`${acc} LIKE :${v}`);
      } else if (f.operator === "does not contain") {
        params[v] = `%${escapeSqlLikePattern(f.value)}%`;
        clauses.push(`(${acc} IS NULL OR ${acc} NOT LIKE :${v})`);
      } else {
        throw new InvalidRequestError(
          `Unsupported itemMetadata operator: ${f.operator}`,
        );
      }
    });

  // eventMetadata = root observation metadata (events_proto.metadata) -> EAV EXISTS over
  // observations_metadata correlated by the item's root observation_id, not dataset item metadata.
  filters
    .filter((f) => f.column === "eventMetadata" && f.type === "stringObject")
    .forEach((f, i) => {
      if (f.type !== "stringObject") return;
      const k = `${tag}emk${i}`;
      const v = `${tag}emv${i}`;
      params[k] = f.key;
      const base = `SELECT 1 FROM ${quoteIdent("observations_metadata")} m WHERE m.${quoteIdent("project_id")} = :projectId AND m.${quoteIdent("entity_id")} = ${alias}.${quoteIdent("observation_id")} AND m.${quoteIdent("key")} = :${k} AND m.${quoteIdent("is_deleted")} = false`;
      if (f.operator === "=") {
        params[v] = f.value;
        clauses.push(`EXISTS (${base} AND m.${quoteIdent("value")} = :${v})`);
      } else if (f.operator === "contains") {
        params[v] = `%${escapeSqlLikePattern(f.value)}%`;
        clauses.push(
          `EXISTS (${base} AND m.${quoteIdent("value")} LIKE :${v})`,
        );
      } else if (f.operator === "does not contain") {
        params[v] = `%${escapeSqlLikePattern(f.value)}%`;
        clauses.push(
          `NOT EXISTS (${base} AND m.${quoteIdent("value")} LIKE :${v})`,
        );
      } else {
        throw new InvalidRequestError(
          `Unsupported eventMetadata operator: ${f.operator}`,
        );
      }
    });
  params.projectId = projectId;
  return { sql: clauses.filter(Boolean).join(" AND "), params };
};

const buildItemQualification = (
  props: ExperimentItemInput,
): {
  ctes: string;
  where: string;
  having: string;
  params: Record<string, unknown>;
  allExperimentIds: string[];
  scope: string;
  scopeParams: Record<string, unknown>;
} => {
  const {
    projectId,
    baseExperimentId,
    compExperimentIds,
    filterByExperiment,
    config,
  } = props;
  const requireBaselinePresence = config?.requireBaselinePresence ?? false;
  const isBaselineEnforced =
    requireBaselinePresence && Boolean(baseExperimentId);
  const filtersByExperiment = new Map(
    filterByExperiment.map((f) => [f.experimentId, f.filters]),
  );
  const filteredCompExperimentIds = compExperimentIds.filter(
    (id) => (filtersByExperiment.get(id) ?? []).length > 0,
  );
  const allExperimentIds = [
    ...(baseExperimentId ? [baseExperimentId] : []),
    ...(isBaselineEnforced ? filteredCompExperimentIds : compExperimentIds),
  ];

  const orParts: string[] = [];
  const params: Record<string, unknown> = { projectId };
  allExperimentIds.forEach((rid, i) => {
    const ridKey = `qrid${i}`;
    params[ridKey] = rid;
    const itemFilter = buildItemGrainFilter(
      filtersByExperiment.get(rid) ?? [],
      "dd",
      projectId,
      `q${i}`,
    );
    Object.assign(params, itemFilter.params);
    const cond = [
      `dd.${quoteIdent("dataset_run_id")} = :${ridKey}`,
      itemFilter.sql,
    ]
      .filter(Boolean)
      .join(" AND ");
    orParts.push(`(${cond})`);
  });

  let having = "";
  if (isBaselineEnforced && baseExperimentId) {
    params.baseExp = baseExperimentId;
    const parts = [
      `sum(CASE WHEN dd.${quoteIdent("dataset_run_id")} = :baseExp THEN 1 ELSE 0 END) > 0`,
    ];
    if (filteredCompExperimentIds.length > 0) {
      const placeholders = filteredCompExperimentIds.map((c, j) => {
        params[`fcomp${j}`] = c;
        return `:fcomp${j}`;
      });
      parts.push(
        `sum(CASE WHEN dd.${quoteIdent("dataset_run_id")} IN (${placeholders.join(", ")}) THEN 1 ELSE 0 END) > 0`,
      );
    }
    having = `HAVING ${parts.join(" AND ")}`;
  }

  // dedup scope = project + the participating runs (selective).
  const runs = greptimeInClause("dataset_run_id", allExperimentIds, "scoperun");
  const scope = `project_id = :projectId AND ${runs.sql} AND ${notDeleted()}`;
  Object.assign(params, runs.params);
  const dedup = driDedupCte(
    [
      "project_id",
      "dataset_item_id",
      "dataset_run_id",
      "trace_id",
      "observation_id",
      "dataset_item_metadata",
    ],
    scope,
  );

  return {
    ctes: `item_dedup AS (${dedup})`,
    where: orParts.length ? `(${orParts.join(" OR ")})` : "1 = 1",
    having,
    params,
    allExperimentIds,
    scope,
    scopeParams: { projectId, ...runs.params },
  };
};

export const getExperimentItemsQualifiedGreptime = async (
  props: ExperimentItemInput & {
    select: "count" | "rows";
    limit?: number;
    offset?: number;
  },
): Promise<string[] | number> => {
  const { select, limit, offset } = props;
  if (props.compExperimentIds.length === 0 && !props.baseExperimentId) {
    return select === "count" ? 0 : [];
  }
  const q = buildItemQualification(props);

  if (select === "count") {
    const rows = await greptimeQuery<{ count: string | number }>({
      query: `
        WITH ${q.ctes}
        SELECT count(*) AS count FROM (
          SELECT dd.${quoteIdent("dataset_item_id")}
          FROM item_dedup dd
          WHERE ${q.where}
          GROUP BY dd.${quoteIdent("dataset_item_id")}
          ${q.having}
        ) x`,
      params: q.params,
      readOnly: true,
    });
    return Number(rows[0]?.count ?? 0);
  }

  const pagination =
    limit !== undefined && offset !== undefined
      ? `LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
      : "";
  const rows = await greptimeQuery<{ item_id: string }>({
    query: `
      WITH ${q.ctes}
      SELECT dd.${quoteIdent("dataset_item_id")} AS item_id
      FROM item_dedup dd
      WHERE ${q.where}
      GROUP BY dd.${quoteIdent("dataset_item_id")}
      ${q.having}
      ORDER BY dd.${quoteIdent("dataset_item_id")} ASC
      ${pagination}`,
    params: q.params,
    readOnly: true,
  });
  return rows.map((r) => r.item_id);
};

/** Per-(item, experiment) root-observation data for the page's items across all experiments. */
export const getExperimentItemsDataGreptime = async (params: {
  projectId: string;
  itemIds: string[];
  experimentIds: string[];
}): Promise<
  {
    item_id: string;
    experiment_id: string;
    level: string | null;
    start_time: Date | null;
    total_cost: number | null;
    latency_ms: number | null;
    observation_id: string;
    trace_id: string;
  }[]
> => {
  const { projectId, itemIds, experimentIds } = params;
  if (itemIds.length === 0 || experimentIds.length === 0) return [];
  const runs = greptimeInClause("dataset_run_id", experimentIds, "run");
  const items = greptimeInClause("dataset_item_id", itemIds, "item");
  const scope = `project_id = :projectId AND ${runs.sql} AND ${items.sql} AND ${notDeleted()}`;
  const dedup = driDedupCte(
    ["dataset_item_id", "dataset_run_id", "trace_id", "observation_id"],
    scope,
  );

  const bounds = await greptimeQuery<{ lo: Date | null; hi: Date | null }>({
    query: `SELECT min(${quoteIdent("dataset_run_created_at")}) AS lo, max(${quoteIdent("dataset_run_created_at")}) AS hi
      FROM ${quoteIdent("dataset_run_items")} WHERE ${scope}`,
    params: { projectId, ...runs.params, ...items.params },
    readOnly: true,
  });
  const lo = greptimeDate(bounds[0]?.lo);
  const hi = greptimeDate(bounds[0]?.hi);
  if (!lo || !hi) return [];
  const obsLo = greptimeTsParam(new Date(lo.getTime() - ONE_DAY_MS));
  const obsHi = greptimeTsParam(new Date(hi.getTime() + ONE_DAY_MS));

  const rows = await greptimeQuery<{
    item_id: string;
    experiment_id: string;
    level: string | null;
    start_time: Date | null;
    total_cost: string | number | null;
    latency_ms: string | number | null;
    observation_id: string | null;
    trace_id: string;
  }>({
    query: `
      WITH item_dedup AS (${dedup})
      SELECT dd.${quoteIdent("dataset_item_id")} AS item_id, dd.${quoteIdent("dataset_run_id")} AS experiment_id,
        o.${quoteIdent("level")} AS level, o.${quoteIdent("start_time")} AS start_time,
        o.${quoteIdent("total_cost")} AS total_cost,
        CASE WHEN o.${quoteIdent("end_time")} IS NULL THEN NULL
          ELSE CAST((to_unixtime(o.${quoteIdent("end_time")}) - to_unixtime(o.${quoteIdent("start_time")})) * 1000 AS BIGINT) END AS latency_ms,
        dd.${quoteIdent("observation_id")} AS observation_id, dd.${quoteIdent("trace_id")} AS trace_id
      FROM item_dedup dd
      LEFT JOIN observations o ON o.${quoteIdent("id")} = dd.${quoteIdent("observation_id")} AND o.${quoteIdent("project_id")} = :projectId
        AND o.${quoteIdent("trace_id")} = dd.${quoteIdent("trace_id")} AND o.${quoteIdent("start_time")} >= :obsLo AND o.${quoteIdent("start_time")} <= :obsHi
        AND o.${quoteIdent("is_deleted")} = false`,
    params: { projectId, ...runs.params, ...items.params, obsLo, obsHi },
    readOnly: true,
  });

  return rows.map((r) => ({
    item_id: r.item_id,
    experiment_id: r.experiment_id,
    level: r.level,
    start_time: r.start_time,
    total_cost: r.total_cost == null ? null : Number(r.total_cost),
    latency_ms: r.latency_ms == null ? null : Number(r.latency_ms),
    observation_id: r.observation_id ?? "",
    trace_id: r.trace_id,
  }));
};
