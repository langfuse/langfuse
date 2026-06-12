import { type FilterState } from "../../../types";
import { type OrderByState } from "../../../interfaces/orderBy";
import { findUiColumnMapping } from "../../../tableDefinitions";
import { sessionCols } from "../../tableMappings/mapSessionTable";
import { greptimeQuery } from "../../greptime/client";
import { quoteIdent } from "../../greptime/schemaUtils";
import {
  BooleanFilter,
  CategoryOptionsFilter,
  DateTimeFilter,
  FilterList,
  NumberFilter,
  ScoreNumberObjectFilter,
  StringFilter,
  StringOptionsFilter,
  type GreptimeFilter,
  type ScoreGrain,
} from "../../greptime/sql/greptime-filter";
import {
  type GreptimeColumnMappings,
  type GreptimeColumnMapping,
} from "../../greptime/sql/columnMappings";
import { greptimeOrderBySql } from "../../greptime/sql/orderby";
import {
  greptimeString,
  requireGreptimeDate,
  requireGreptimeString,
} from "../../greptime/sql/rowContract";
import { clickhouseCompliantRandomCharacters } from "..";
import { greptimeTsParam } from "./queryHelpers";

/**
 * GreptimeDB sessions UI table reads (04-read-path.md, P2). Replaces the ClickHouse
 * `sessions-ui-table-service` 5-CTE rollup (FINAL + LIMIT 1 BY + sumMap/groupArrayIf). On the merged
 * `last_non_null` projection the dedup CTEs collapse: a single `session_result` CTE groups traces
 * (LEFT JOIN observations) by session and `DISTINCT`-aggregates ids/users/counts plus known-key
 * cost/usage sums; `session_tags` unions trace tags via the `traces_tags` EAV.
 *
 * No Phase 2 / scores CTE: both callers (web sessions router, worker export stream) fetch scores
 * separately via `getScoresForSessions` and never read the dynamic usage/cost maps — only the
 * known-key input/output/total sums. Score *filters* are grain-aware EXISTS over `scores` by
 * `session_id`; userIds / tags filters are correlated EXISTS over the session's traces.
 */

// TRACE_TO_OBSERVATIONS_INTERVAL = "INTERVAL 1 HOUR".
const SESSION_OBS_LOOKBACK_MS = 60 * 60 * 1000;

// array_agg comes back over the MySQL wire as an unquoted bracket-string ("[a, b]"), which is not
// valid JSON; `array_to_string(array_agg(...), :sep)` yields a clean, NULL-skipping joined string we
// split app-side. The ASCII Unit Separator avoids collisions with commas/spaces in user ids / tags.
const ARRAY_SEP = "\u001f";
const splitAgg = (v: unknown): string[] =>
  v == null || v === "" ? [] : String(v).split(ARRAY_SEP).filter(Boolean);

const SESSION_GRAIN: ScoreGrain = {
  scoresColumn: "session_id",
  outerPrefix: "s",
  outerColumn: "session_id",
};

const q = quoteIdent;
const uid = () => clickhouseCompliantRandomCharacters();

export type SessionDataReturnType = {
  session_id: string;
  max_timestamp: string;
  min_timestamp: string;
  trace_ids: string[];
  user_ids: string[];
  trace_count: number;
  trace_tags: string[];
  trace_environment?: string;
};

export type SessionWithMetricsReturnType = SessionDataReturnType & {
  total_observations: number;
  duration: number;
  session_usage_details: Record<string, number>;
  session_cost_details: Record<string, number>;
  session_input_cost: string;
  session_output_cost: string;
  session_total_cost: string;
  session_input_usage: string;
  session_output_usage: string;
  session_total_usage: string;
};

export type GreptimeSessionsProps = {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
};

// ---------------------------------------------------------------------------
// filter routing (pre-aggregation trace filters vs post-aggregation session filters)
// ---------------------------------------------------------------------------

type CompiledSession = {
  preWhere: string; // trace-level conditions inside session_result / session_tags
  postWhere: string; // session-level conditions in the outer WHERE
  params: Record<string, unknown>;
  obsLookback?: string;
};

const buildSessionFilters = (filter: FilterState): CompiledSession => {
  const pre: GreptimeFilter[] = [];
  const post: GreptimeFilter[] = [];
  const postExists: string[] = [];
  const params: Record<string, unknown> = {};
  let tsValue: Date | undefined;

  // Correlated EXISTS over the session's traces (userIds / tags filters).
  const traceExists = (predicate: string, negate = false): string =>
    `${negate ? "NOT EXISTS" : "EXISTS"} (SELECT 1 FROM ${q("traces")} tu ` +
    `WHERE tu.${q("project_id")} = s.${q("project_id")} ` +
    `AND tu.${q("session_id")} = s.${q("session_id")} ` +
    `AND tu.${q("is_deleted")} = false AND ${predicate})`;

  const tagExists = (predicate: string, negate = false): string =>
    `${negate ? "NOT EXISTS" : "EXISTS"} (SELECT 1 FROM ${q("traces")} tu ` +
    `JOIN ${q("traces_tags")} mt ON mt.${q("entity_id")} = tu.${q("id")} ` +
    `AND mt.${q("project_id")} = tu.${q("project_id")} AND mt.${q("is_deleted")} = false ` +
    `WHERE tu.${q("project_id")} = s.${q("project_id")} ` +
    `AND tu.${q("session_id")} = s.${q("session_id")} ` +
    `AND tu.${q("is_deleted")} = false AND ${predicate})`;

  const bindList = (values: readonly string[]): string =>
    values
      .map((v) => {
        const name = `v${uid()}`;
        params[name] = v;
        return `:${name}`;
      })
      .join(", ") || "NULL";

  const postNum = (
    f: Extract<FilterState[number], { type: "number" }>,
    ref: string,
  ) =>
    post.push(
      new NumberFilter({
        table: "traces",
        field: ref,
        operator: f.operator,
        value: f.value,
      }),
    );

  for (const f of filter) {
    const chSel = findUiColumnMapping(sessionCols, f.column)?.clickhouseSelect;
    switch (chSel) {
      case "bookmarked":
        if (f.type === "boolean")
          pre.push(
            new BooleanFilter({
              table: "traces",
              field: "bookmarked",
              operator: f.operator,
              value: f.value,
              tablePrefix: "t",
            }),
          );
        break;
      case "session_id":
        if (f.type === "stringOptions")
          pre.push(
            new StringOptionsFilter({
              table: "traces",
              field: "session_id",
              operator: f.operator,
              values: f.value,
              tablePrefix: "t",
            }),
          );
        else if (f.type === "string")
          pre.push(
            new StringFilter({
              table: "traces",
              field: "session_id",
              operator: f.operator,
              value: f.value,
              tablePrefix: "t",
            }),
          );
        break;
      case "environment":
        if (f.type === "stringOptions")
          pre.push(
            new StringOptionsFilter({
              table: "traces",
              field: "environment",
              operator: f.operator,
              values: f.value,
              tablePrefix: "t",
            }),
          );
        else if (f.type === "string")
          pre.push(
            new StringFilter({
              table: "traces",
              field: "environment",
              operator: f.operator,
              value: f.value,
              tablePrefix: "t",
            }),
          );
        break;
      case "min_timestamp":
        if (f.type === "datetime") {
          pre.push(
            new DateTimeFilter({
              table: "traces",
              field: "timestamp",
              operator: f.operator,
              value: f.value,
              tablePrefix: "t",
            }),
          );
          if (f.operator === ">=" || f.operator === ">") tsValue = f.value;
        }
        break;
      case "user_ids":
        if (f.type === "arrayOptions" && f.value.length > 0) {
          const userRef = `tu.${q("user_id")}`;
          if (f.operator === "all of") {
            // every user must appear on some trace of the session
            for (const u of f.value) {
              const name = `v${uid()}`;
              params[name] = u;
              postExists.push(traceExists(`${userRef} = :${name}`));
            }
          } else {
            postExists.push(
              traceExists(
                `${userRef} IN (${bindList(f.value)})`,
                f.operator === "none of",
              ),
            );
          }
        }
        break;
      case "trace_tags":
        if (f.type === "arrayOptions" && f.value.length > 0) {
          const tagRef = `mt.${q("tag")}`;
          if (f.operator === "all of") {
            for (const t of f.value) {
              const name = `v${uid()}`;
              params[name] = t;
              postExists.push(tagExists(`${tagRef} = :${name}`));
            }
          } else {
            postExists.push(
              tagExists(
                `${tagRef} IN (${bindList(f.value)})`,
                f.operator === "none of",
              ),
            );
          }
        }
        break;
      case "duration":
        if (f.type === "number") postNum(f, "s.duration");
        break;
      case "trace_count":
        if (f.type === "number") postNum(f, "s.trace_count");
        break;
      case "session_input_cost":
        if (f.type === "number") postNum(f, "s.session_input_cost");
        break;
      case "session_output_cost":
        if (f.type === "number") postNum(f, "s.session_output_cost");
        break;
      case "session_total_cost":
        if (f.type === "number") postNum(f, "s.session_total_cost");
        break;
      case "session_input_usage":
        if (f.type === "number") postNum(f, "s.session_input_usage");
        break;
      case "session_output_usage":
        if (f.type === "number") postNum(f, "s.session_output_usage");
        break;
      case "session_total_usage":
        if (f.type === "number") postNum(f, "s.session_total_usage");
        break;
      case "scores_avg":
        if (f.type === "numberObject")
          post.push(
            new ScoreNumberObjectFilter({
              key: f.key,
              value: f.value,
              operator: f.operator,
              grain: SESSION_GRAIN,
            }),
          );
        break;
      case "score_categories":
        if (f.type === "categoryOptions")
          post.push(
            new CategoryOptionsFilter({
              key: f.key,
              values: f.value,
              operator: f.operator,
              grain: SESSION_GRAIN,
            }),
          );
        break;
      default:
        break; // comment columns / unknown -> handled upstream
    }
  }

  const preRes = new FilterList(pre).apply();
  const postRes = new FilterList(post).apply();
  Object.assign(params, preRes.params, postRes.params);

  const postClauses = [postRes.query, ...postExists].filter(Boolean);
  return {
    preWhere: preRes.query,
    postWhere: postClauses.join(" AND "),
    params,
    obsLookback: tsValue
      ? greptimeTsParam(new Date(tsValue.getTime() - SESSION_OBS_LOOKBACK_MS))
      : undefined,
  };
};

// ---------------------------------------------------------------------------
// order by
// ---------------------------------------------------------------------------

const aggCol = (
  uiTableName: string,
  uiTableId: string,
  select: string,
): GreptimeColumnMapping => ({
  uiTableName,
  uiTableId,
  greptimeTableName: "traces",
  greptimeSelect: select,
});

const sessionsOrderByCols: GreptimeColumnMappings = [
  aggCol("ID", "id", "s.session_id"),
  aggCol("Created At", "createdAt", "s.min_timestamp"),
  aggCol("Session Duration (s)", "sessionDuration", "s.duration"),
  aggCol("Traces Count", "countTraces", "s.trace_count"),
  aggCol("Traces Count", "tracesCount", "s.trace_count"),
  aggCol("Input Cost ($)", "inputCost", "s.session_input_cost"),
  aggCol("Output Cost ($)", "outputCost", "s.session_output_cost"),
  aggCol("Total Cost ($)", "totalCost", "s.session_total_cost"),
  aggCol("Input Tokens", "inputTokens", "s.session_input_usage"),
  aggCol("Output Tokens", "outputTokens", "s.session_output_usage"),
  aggCol("Total Tokens", "totalTokens", "s.session_total_usage"),
  aggCol("Usage", "usage", "s.session_total_usage"),
];

const sessionsOrderByClause = (orderBy?: OrderByState): string => {
  const primary: OrderByState = orderBy ?? {
    column: "createdAt",
    order: "DESC",
  };
  return greptimeOrderBySql(
    [primary, { column: "id", order: primary?.order ?? "DESC" }],
    sessionsOrderByCols,
  );
};

// ---------------------------------------------------------------------------
// query assembly
// ---------------------------------------------------------------------------

const buildSessionResultCte = (compiled: CompiledSession): string => `
  session_result AS (
    SELECT
      t.session_id AS session_id,
      t.project_id AS project_id,
      max(t.timestamp) AS max_timestamp,
      min(t.timestamp) AS min_timestamp,
      array_to_string(array_agg(DISTINCT t.id), :arraySep) AS trace_ids,
      array_to_string(array_agg(DISTINCT t.user_id), :arraySep) AS user_ids,
      count(DISTINCT t.id) AS trace_count,
      max(t.environment) AS environment,
      count(DISTINCT o.id) AS total_observations,
      CAST(to_unixtime(max(o.end_time)) - to_unixtime(min(o.start_time)) AS BIGINT) AS duration,
      sum(coalesce(o.total_cost, 0)) AS session_total_cost,
      sum(coalesce(json_get_float(o.cost_details, 'input'), 0)) AS session_input_cost,
      sum(coalesce(json_get_float(o.cost_details, 'output'), 0)) AS session_output_cost,
      sum(coalesce(json_get_float(o.usage_details, 'input'), 0)) AS session_input_usage,
      sum(coalesce(json_get_float(o.usage_details, 'output'), 0)) AS session_output_usage,
      sum(coalesce(json_get_float(o.usage_details, 'total'), 0)) AS session_total_usage
    FROM traces t
    LEFT JOIN observations o
      ON o.trace_id = t.id AND o.project_id = t.project_id AND o.is_deleted = false
      ${compiled.obsLookback ? "AND o.start_time >= :sessObsLookback" : ""}
    WHERE t.project_id = :projectId AND t.session_id IS NOT NULL AND t.is_deleted = false
      ${compiled.preWhere ? `AND ${compiled.preWhere}` : ""}
    GROUP BY t.session_id, t.project_id
  )`;

const buildSessionTagsCte = (compiled: CompiledSession): string => `
  session_tags AS (
    SELECT t.session_id AS session_id, t.project_id AS project_id,
      array_to_string(array_agg(DISTINCT mt.tag), :arraySep) AS trace_tags
    FROM traces t
    JOIN traces_tags mt ON mt.entity_id = t.id AND mt.project_id = t.project_id AND mt.is_deleted = false
    WHERE t.project_id = :projectId AND t.session_id IS NOT NULL AND t.is_deleted = false
      ${compiled.preWhere ? `AND ${compiled.preWhere}` : ""}
    GROUP BY t.session_id, t.project_id
  )`;

const pagination = (props: GreptimeSessionsProps) =>
  props.limit !== undefined && props.page !== undefined
    ? {
        clause: "LIMIT :limit OFFSET :offset",
        params: { limit: props.limit, offset: props.limit * props.page },
      }
    : { clause: "", params: {} };

const baseParams = (compiled: CompiledSession, projectId: string) => ({
  projectId,
  arraySep: ARRAY_SEP,
  ...(compiled.obsLookback ? { sessObsLookback: compiled.obsLookback } : {}),
  ...compiled.params,
});

// ---------------------------------------------------------------------------
// public reads
// ---------------------------------------------------------------------------

export const getSessionsTableCountGreptime = async (
  props: GreptimeSessionsProps,
): Promise<number> => {
  const compiled = buildSessionFilters(props.filter);
  const rows = await greptimeQuery<{ count: string | number }>({
    query: `
      WITH ${buildSessionResultCte(compiled)}
      SELECT count(*) AS count
      FROM session_result s
      ${compiled.postWhere ? `WHERE ${compiled.postWhere}` : ""}`,
    params: baseParams(compiled, props.projectId),
    readOnly: true,
  });
  return rows.length > 0 ? Number(rows[0].count) : 0;
};

export const getSessionsTableGreptime = async (
  props: GreptimeSessionsProps,
): Promise<SessionDataReturnType[]> => {
  const compiled = buildSessionFilters(props.filter);
  const page = pagination(props);
  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      WITH ${buildSessionResultCte(compiled)},
      ${buildSessionTagsCte(compiled)}
      SELECT s.session_id AS session_id, s.max_timestamp AS max_timestamp,
        s.min_timestamp AS min_timestamp, s.trace_ids AS trace_ids,
        s.user_ids AS user_ids, s.trace_count AS trace_count,
        s.environment AS environment, tg.trace_tags AS trace_tags
      FROM session_result s
      LEFT JOIN session_tags tg ON tg.session_id = s.session_id AND tg.project_id = s.project_id
      ${compiled.postWhere ? `WHERE ${compiled.postWhere}` : ""}
      ${sessionsOrderByClause(props.orderBy)}
      ${page.clause}`,
    params: { ...baseParams(compiled, props.projectId), ...page.params },
    readOnly: true,
  });
  return rows.map(convertSessionRow);
};

export const getSessionsWithMetricsGreptime = async (
  props: GreptimeSessionsProps,
): Promise<SessionWithMetricsReturnType[]> => {
  const compiled = buildSessionFilters(props.filter);
  const page = pagination(props);
  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      WITH ${buildSessionResultCte(compiled)},
      ${buildSessionTagsCte(compiled)}
      SELECT s.session_id AS session_id, s.max_timestamp AS max_timestamp,
        s.min_timestamp AS min_timestamp, s.trace_ids AS trace_ids,
        s.user_ids AS user_ids, s.trace_count AS trace_count,
        s.environment AS environment, tg.trace_tags AS trace_tags,
        s.total_observations AS total_observations, s.duration AS duration,
        s.session_total_cost AS session_total_cost,
        s.session_input_cost AS session_input_cost,
        s.session_output_cost AS session_output_cost,
        s.session_input_usage AS session_input_usage,
        s.session_output_usage AS session_output_usage,
        s.session_total_usage AS session_total_usage
      FROM session_result s
      LEFT JOIN session_tags tg ON tg.session_id = s.session_id AND tg.project_id = s.project_id
      ${compiled.postWhere ? `WHERE ${compiled.postWhere}` : ""}
      ${sessionsOrderByClause(props.orderBy)}
      ${page.clause}`,
    params: { ...baseParams(compiled, props.projectId), ...page.params },
    readOnly: true,
  });
  return rows.map(convertSessionMetricsRow);
};

// ---------------------------------------------------------------------------
// converters
// ---------------------------------------------------------------------------

const toIso = (v: unknown, field: string): string =>
  requireGreptimeDate(v, field).toISOString();

const convertSessionRow = (
  row: Record<string, unknown>,
): SessionDataReturnType => ({
  session_id: requireGreptimeString(row.session_id, "sessions.session_id"),
  max_timestamp: toIso(row.max_timestamp, "sessions.max_timestamp"),
  min_timestamp: toIso(row.min_timestamp, "sessions.min_timestamp"),
  trace_ids: splitAgg(row.trace_ids),
  user_ids: splitAgg(row.user_ids),
  trace_count: Number(row.trace_count ?? 0),
  trace_tags: splitAgg(row.trace_tags),
  trace_environment: greptimeString(row.environment) ?? undefined,
});

// Tokens are integer counts; round defensively so a float-typed JSON sum stays BigInt-safe downstream.
const intStr = (v: unknown): string => String(Math.round(Number(v ?? 0)));
const numStr = (v: unknown): string => String(Number(v ?? 0));

const convertSessionMetricsRow = (
  row: Record<string, unknown>,
): SessionWithMetricsReturnType => {
  const inputCost = Number(row.session_input_cost ?? 0);
  const outputCost = Number(row.session_output_cost ?? 0);
  const totalCost = Number(row.session_total_cost ?? 0);
  const inputUsage = Number(row.session_input_usage ?? 0);
  const outputUsage = Number(row.session_output_usage ?? 0);
  const totalUsage = Number(row.session_total_usage ?? 0);
  return {
    ...convertSessionRow(row),
    total_observations: Number(row.total_observations ?? 0),
    duration: Number(row.duration ?? 0),
    // Known-key maps only (the dynamic per-key breakdown is not consumed for sessions).
    session_usage_details: {
      input: inputUsage,
      output: outputUsage,
      total: totalUsage,
    },
    session_cost_details: {
      input: inputCost,
      output: outputCost,
      total: totalCost,
    },
    session_input_cost: numStr(row.session_input_cost),
    session_output_cost: numStr(row.session_output_cost),
    session_total_cost: numStr(row.session_total_cost),
    session_input_usage: intStr(row.session_input_usage),
    session_output_usage: intStr(row.session_output_usage),
    session_total_usage: intStr(row.session_total_usage),
  };
};
