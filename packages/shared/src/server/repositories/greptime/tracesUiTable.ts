import Decimal from "decimal.js";

import { type FilterState } from "../../../types";
import { type OrderByState } from "../../../interfaces/orderBy";
import { type TracingSearchType } from "../../../interfaces/search";
import { type ObservationLevelType, type TraceDomain } from "../../../domain";
import { findUiColumnMapping } from "../../../tableDefinitions";
import { tracesTableCols } from "../../../tableDefinitions/tracesTable";
import { ScoreAggregate } from "../../../features/scores";
import { greptimeQuery } from "../../greptime/client";
import { createGreptimeFilterFromFilterState } from "../../greptime/sql/factory";
import {
  FilterList,
  StringFilter,
  StringOptionsFilter,
  type DateTimeFilter,
} from "../../greptime/sql/greptime-filter";
import { tracesTableGreptimeColumnDefinitions } from "../../greptime/sql/columnMappings";
import { greptimeOrderBySql } from "../../greptime/sql/orderby";
import { greptimeSearchCondition } from "../../greptime/sql/search";
import {
  greptimeAggregatedLevelString,
  greptimeKnownKeySum,
  greptimeLatencyMs,
  greptimeLevelCounts,
} from "../../greptime/sql/fragments";
import { selectJsonColumn } from "../../greptime/sql/rowContract";
import { quoteIdent } from "../../greptime/schemaUtils";
import {
  greptimeBool,
  greptimeJson,
  greptimeString,
  requireGreptimeDate,
  requireGreptimeString,
} from "../../greptime/sql/rowContract";
import { reduceUsageOrCostDetails } from "../observations_converters";
import { mergeUsageOrCostMaps } from "./rollup";
import { greptimeInClause, greptimeTsParam, notDeleted } from "./queryHelpers";

/**
 * GreptimeDB traces UI table reads (04-read-path.md, P2). Replaces the ClickHouse
 * `traces-ui-table-service` rollup: the CH `observations_stats` CTE used `sumMap`/`countIf`/
 * `multiIf`, none of which GreptimeDB has. Strategy:
 *   - count / rows / identifiers: plain SELECT on the merged `traces` projection, joining the
 *     observations rollup CTE only when a filter/orderBy targets it.
 *   - metrics: TWO PHASE. Phase 1 computes SQL-aggregatable scalars (count, latency span, per-level
 *     counts, max-severity level, known-key usage/cost sums for filter/orderBy) and the page ids via
 *     `ORDER BY ... LIMIT/OFFSET`. Phase 2 pulls the per-observation usage/cost JSON for just the page
 *     and merges every key app-side (`mergeUsageOrCostMaps`), because GreptimeDB cannot enumerate
 *     dynamic JSON map keys in SQL.
 *
 * Scores are NOT aggregated here: callers of `getTracesTableMetrics` fetch them separately via
 * `getScoresForTraces` (the CH converter dropped `scores_avg` too), so the metrics path needs no
 * scores CTE. Score *filters* (`scores_avg` / `score_categories`) are self-contained correlated
 * EXISTS over `scores` (see `greptime-filter.ts`), applied in the outer WHERE.
 */

// OBSERVATIONS_TO_TRACE_INTERVAL = "INTERVAL 2 DAY": observations of a trace start within 2 days of it.
const OBSERVATIONS_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

export type GreptimeTracesTableProps = {
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
};

export type GreptimeTracesTableRow = Pick<
  TraceDomain,
  | "id"
  | "projectId"
  | "timestamp"
  | "tags"
  | "bookmarked"
  | "name"
  | "release"
  | "version"
  | "userId"
  | "environment"
  | "sessionId"
  | "public"
>;

export type GreptimeTracesTableMetrics = {
  id: string;
  projectId: string;
  promptTokens: bigint;
  completionTokens: bigint;
  totalTokens: bigint;
  latency: number | null;
  level: ObservationLevelType;
  observationCount: bigint;
  calculatedTotalCost: Decimal | null;
  calculatedInputCost: Decimal | null;
  calculatedOutputCost: Decimal | null;
  usageDetails: Record<string, number>;
  costDetails: Record<string, number>;
  errorCount: bigint;
  warningCount: bigint;
  defaultCount: bigint;
  debugCount: bigint;
};

// Subset of TracesMetricsUiReturnType the table service exposes (scores joined by the caller).
export type GreptimeTracesTableMetricsRow = Omit<
  GreptimeTracesTableMetrics & { scores: ScoreAggregate },
  "scores"
>;

// ---------------------------------------------------------------------------
// shared filter / SQL assembly
// ---------------------------------------------------------------------------

type AssembledQuery = {
  tracesFilterSql: string;
  cteSql: string;
  requiresObservationsJoin: boolean;
  obsLookback?: string;
  params: Record<string, unknown>;
};

const buildShared = (props: GreptimeTracesTableProps): AssembledQuery => {
  const { projectId, filter, orderBy } = props;

  const tracesFilter = new FilterList(
    createGreptimeFilterFromFilterState(
      filter,
      tracesTableGreptimeColumnDefinitions,
      tracesTableCols,
    ),
  );

  // Scope the observation rollup to the filtered trace ids when the user filtered by id (perf only;
  // correctness comes from the LEFT JOIN). Mirrors the CH traceId push into the observations CTE.
  const observationsFilter = new FilterList();
  const traceIdFilter = tracesFilter.find(
    (f) => f.table === "traces" && f.field === "id",
  );
  const traceIdValues =
    traceIdFilter instanceof StringFilter && traceIdFilter.operator === "="
      ? [traceIdFilter.value]
      : traceIdFilter instanceof StringOptionsFilter &&
          traceIdFilter.operator === "any of"
        ? traceIdFilter.values
        : null;
  if (traceIdValues) {
    observationsFilter.push(
      new StringOptionsFilter({
        table: "observations",
        field: "trace_id",
        operator: "any of",
        values: traceIdValues,
      }),
    );
  }

  // Trace timestamp lower bound -> observation start_time lookback (absolute, app-computed).
  const tsFilter = tracesFilter.find(
    (f) =>
      f.field === "timestamp" && (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;
  const obsLookback = tsFilter
    ? greptimeTsParam(
        new Date(tsFilter.value.getTime() - OBSERVATIONS_LOOKBACK_MS),
      )
    : undefined;

  const requiresObservationsJoin =
    tracesFilter.some((f) => f.table === "observations") ||
    findUiColumnMapping(tracesTableGreptimeColumnDefinitions, orderBy?.column)
      ?.greptimeTableName === "observations";

  const tracesFilterRes = tracesFilter.apply();
  const obsFilterRes = observationsFilter.apply();

  const cteSql = `observations_stats AS (
      SELECT
        trace_id,
        project_id,
        count(*) AS observation_count,
        ${greptimeLatencyMs()} AS latency_milliseconds,
        ${greptimeLevelCounts()},
        ${greptimeAggregatedLevelString()},
        sum(total_cost) AS cost_total,
        ${greptimeKnownKeySum("cost_details", "input", undefined, "cost_input")},
        ${greptimeKnownKeySum("cost_details", "output", undefined, "cost_output")},
        ${greptimeKnownKeySum("usage_details", "input", undefined, "usage_input")},
        ${greptimeKnownKeySum("usage_details", "output", undefined, "usage_output")},
        ${greptimeKnownKeySum("usage_details", "total", undefined, "usage_total")}
      FROM observations
      WHERE project_id = :projectId AND ${notDeleted()}
        ${obsLookback ? "AND start_time >= :obsLookback" : ""}
        ${obsFilterRes.query ? `AND ${obsFilterRes.query}` : ""}
      GROUP BY trace_id, project_id
    )`;

  return {
    tracesFilterSql: tracesFilterRes.query,
    cteSql,
    requiresObservationsJoin,
    obsLookback,
    params: {
      projectId,
      ...(obsLookback ? { obsLookback } : {}),
      ...tracesFilterRes.params,
      ...obsFilterRes.params,
    },
  };
};

const orderByClause = (orderBy?: OrderByState): string => {
  const primary: OrderByState = orderBy ?? {
    column: "timestamp",
    order: "DESC",
  };
  // Stable tiebreaker on the unique trace id, same direction (merged projection: one row per id).
  return greptimeOrderBySql(
    [primary, { column: "id", order: primary?.order ?? "DESC" }],
    tracesTableGreptimeColumnDefinitions,
  );
};

const paginationClause = (props: GreptimeTracesTableProps): string =>
  props.limit !== undefined && props.page !== undefined
    ? "LIMIT :limit OFFSET :offset"
    : "";

const paginationParams = (
  props: GreptimeTracesTableProps,
): Record<string, number> =>
  props.limit !== undefined && props.page !== undefined
    ? { limit: props.limit, offset: props.limit * props.page }
    : {};

// ---------------------------------------------------------------------------
// count
// ---------------------------------------------------------------------------

export const getTracesTableCountGreptime = async (
  props: GreptimeTracesTableProps,
): Promise<number> => {
  const shared = buildShared(props);
  const search = greptimeSearchCondition({
    query: props.searchQuery,
    searchType: props.searchType,
    tablePrefix: "t",
  });
  const join = shared.requiresObservationsJoin;

  const rows = await greptimeQuery<{ count: string | number }>({
    query: `
      ${join ? `WITH ${shared.cteSql}` : ""}
      SELECT count(distinct t.id) AS count
      FROM traces t
      ${join ? "LEFT JOIN observations_stats o ON o.project_id = t.project_id AND o.trace_id = t.id" : ""}
      WHERE t.project_id = :projectId AND ${notDeleted("t")}
        ${shared.tracesFilterSql ? `AND ${shared.tracesFilterSql}` : ""}
        ${search.query}`,
    params: { ...shared.params, ...search.params },
    readOnly: true,
  });

  return rows.length > 0 ? Number(rows[0].count) : 0;
};

// ---------------------------------------------------------------------------
// rows / identifiers
// ---------------------------------------------------------------------------

export const getTracesTableGreptime = async (
  props: GreptimeTracesTableProps,
): Promise<GreptimeTracesTableRow[]> => {
  const shared = buildShared(props);
  const search = greptimeSearchCondition({
    query: props.searchQuery,
    searchType: props.searchType,
    tablePrefix: "t",
  });
  const join = shared.requiresObservationsJoin;

  const select = [
    "t.id AS id",
    "t.project_id AS project_id",
    "t.timestamp AS timestamp",
    "t.bookmarked AS bookmarked",
    "t.public AS public",
    `t.${quoteIdent("name")} AS ${quoteIdent("name")}`,
    `t.${quoteIdent("release")} AS ${quoteIdent("release")}`,
    `t.${quoteIdent("version")} AS ${quoteIdent("version")}`,
    `t.${quoteIdent("user_id")} AS user_id`,
    `t.${quoteIdent("environment")} AS ${quoteIdent("environment")}`,
    `t.${quoteIdent("session_id")} AS session_id`,
    selectJsonColumn("tags", { tablePrefix: "t" }),
  ].join(", ");

  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      ${join ? `WITH ${shared.cteSql}` : ""}
      SELECT ${select}
      FROM traces t
      ${join ? "LEFT JOIN observations_stats o ON o.project_id = t.project_id AND o.trace_id = t.id" : ""}
      WHERE t.project_id = :projectId AND ${notDeleted("t")}
        ${shared.tracesFilterSql ? `AND ${shared.tracesFilterSql}` : ""}
        ${search.query}
      ${orderByClause(props.orderBy)}
      ${paginationClause(props)}`,
    params: { ...shared.params, ...search.params, ...paginationParams(props) },
    readOnly: true,
  });

  return rows.map(convertRow);
};

export const getTraceIdentifiersGreptime = async (
  props: GreptimeTracesTableProps,
): Promise<Array<{ id: string; projectId: string; timestamp: Date }>> => {
  const shared = buildShared(props);
  const search = greptimeSearchCondition({
    query: props.searchQuery,
    searchType: props.searchType,
    tablePrefix: "t",
  });
  const join = shared.requiresObservationsJoin;

  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      ${join ? `WITH ${shared.cteSql}` : ""}
      SELECT t.id AS id, t.project_id AS project_id, t.timestamp AS timestamp
      FROM traces t
      ${join ? "LEFT JOIN observations_stats o ON o.project_id = t.project_id AND o.trace_id = t.id" : ""}
      WHERE t.project_id = :projectId AND ${notDeleted("t")}
        ${shared.tracesFilterSql ? `AND ${shared.tracesFilterSql}` : ""}
        ${search.query}
      ${orderByClause(props.orderBy)}
      ${paginationClause(props)}`,
    params: { ...shared.params, ...search.params, ...paginationParams(props) },
    readOnly: true,
  });

  return rows.map((row) => ({
    id: requireGreptimeString(row.id, "traces.id"),
    projectId: requireGreptimeString(row.project_id, "traces.project_id"),
    timestamp: requireGreptimeDate(row.timestamp, "traces.timestamp"),
  }));
};

// ---------------------------------------------------------------------------
// metrics (two phase)
// ---------------------------------------------------------------------------

export const getTracesTableMetricsGreptime = async (
  props: GreptimeTracesTableProps,
): Promise<GreptimeTracesTableMetricsRow[]> => {
  const shared = buildShared(props);
  const search = greptimeSearchCondition({
    query: props.searchQuery,
    searchType: props.searchType,
    tablePrefix: "t",
  });

  // Phase 1: scalar metrics + page ids. Observations rollup is always joined.
  const phase1 = await greptimeQuery<{
    id: string;
    project_id: string;
    timestamp: Date | string;
    latency: string | number | null;
    level: string | null;
    error_count: string | number | null;
    warning_count: string | number | null;
    default_count: string | number | null;
    debug_count: string | number | null;
    observation_count: string | number | null;
  }>({
    query: `
      WITH ${shared.cteSql}
      SELECT
        t.id AS id,
        t.project_id AS project_id,
        t.timestamp AS timestamp,
        o.latency_milliseconds / 1000 AS latency,
        o.aggregated_level AS level,
        o.error_count AS error_count,
        o.warning_count AS warning_count,
        o.default_count AS default_count,
        o.debug_count AS debug_count,
        o.observation_count AS observation_count
      FROM traces t
      LEFT JOIN observations_stats o ON o.project_id = t.project_id AND o.trace_id = t.id
      WHERE t.project_id = :projectId AND ${notDeleted("t")}
        ${shared.tracesFilterSql ? `AND ${shared.tracesFilterSql}` : ""}
        ${search.query}
      ${orderByClause(props.orderBy)}
      ${paginationClause(props)}`,
    params: { ...shared.params, ...search.params, ...paginationParams(props) },
    readOnly: true,
  });

  if (phase1.length === 0) return [];

  // Phase 2: full usage/cost JSON maps for the page, merged key-by-key app-side.
  const { usageByTrace, costByTrace } = await fetchUsageCostMaps(
    props.projectId,
    phase1.map((r) => r.id),
    shared.obsLookback,
  );

  return phase1.map((row) => {
    const usageMap = usageByTrace.get(row.id) ?? {};
    const costMap = costByTrace.get(row.id) ?? {};
    const reducedUsage = reduceUsageOrCostDetails(usageMap);
    return {
      id: row.id,
      projectId: row.project_id,
      latency: row.latency == null ? null : Number(row.latency),
      promptTokens: BigInt(reducedUsage.input ?? 0),
      completionTokens: BigInt(reducedUsage.output ?? 0),
      totalTokens: BigInt(reducedUsage.total ?? 0),
      usageDetails: usageMap,
      costDetails: costMap,
      observationCount: BigInt(Number(row.observation_count ?? 0)),
      calculatedTotalCost:
        costMap.total != null ? new Decimal(costMap.total) : null,
      calculatedInputCost:
        costMap.input != null ? new Decimal(costMap.input) : null,
      calculatedOutputCost:
        costMap.output != null ? new Decimal(costMap.output) : null,
      level: (greptimeString(row.level) ?? "DEFAULT") as ObservationLevelType,
      errorCount: BigInt(Number(row.error_count ?? 0)),
      warningCount: BigInt(Number(row.warning_count ?? 0)),
      defaultCount: BigInt(Number(row.default_count ?? 0)),
      debugCount: BigInt(Number(row.debug_count ?? 0)),
    };
  });
};

const fetchUsageCostMaps = async (
  projectId: string,
  traceIds: string[],
  obsLookback?: string,
): Promise<{
  usageByTrace: Map<string, Record<string, number>>;
  costByTrace: Map<string, Record<string, number>>;
}> => {
  const usageByTrace = new Map<string, Record<string, number>>();
  const costByTrace = new Map<string, Record<string, number>>();
  if (traceIds.length === 0) return { usageByTrace, costByTrace };

  const idList = greptimeInClause("trace_id", traceIds, "ptid");
  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      SELECT
        trace_id AS trace_id,
        ${selectJsonColumn("usage_details")},
        ${selectJsonColumn("cost_details")}
      FROM observations
      WHERE project_id = :projectId AND ${notDeleted()}
        AND ${idList.sql}
        ${obsLookback ? "AND start_time >= :obsLookback" : ""}`,
    params: {
      projectId,
      ...idList.params,
      ...(obsLookback ? { obsLookback } : {}),
    },
    readOnly: true,
  });

  // Group the per-observation maps by trace, then sum every key (dynamic keys included).
  const usageRows = new Map<string, Array<Record<string, number>>>();
  const costRows = new Map<string, Array<Record<string, number>>>();
  for (const row of rows) {
    const traceId = requireGreptimeString(
      row.trace_id,
      "observations.trace_id",
    );
    (usageRows.get(traceId) ?? usageRows.set(traceId, []).get(traceId)!).push(
      greptimeJson<Record<string, number>>(row.usage_details, {}),
    );
    (costRows.get(traceId) ?? costRows.set(traceId, []).get(traceId)!).push(
      greptimeJson<Record<string, number>>(row.cost_details, {}),
    );
  }
  for (const [traceId, maps] of usageRows) {
    usageByTrace.set(traceId, mergeUsageOrCostMaps(maps));
  }
  for (const [traceId, maps] of costRows) {
    costByTrace.set(traceId, mergeUsageOrCostMaps(maps));
  }

  return { usageByTrace, costByTrace };
};

// ---------------------------------------------------------------------------
// row -> domain
// ---------------------------------------------------------------------------

const convertRow = (row: Record<string, unknown>): GreptimeTracesTableRow => ({
  id: requireGreptimeString(row.id, "traces.id"),
  projectId: requireGreptimeString(row.project_id, "traces.project_id"),
  timestamp: requireGreptimeDate(row.timestamp, "traces.timestamp"),
  tags: greptimeJson<string[]>(row.tags, []),
  bookmarked: greptimeBool(row.bookmarked),
  name: greptimeString(row.name),
  release: greptimeString(row.release),
  version: greptimeString(row.version),
  userId: greptimeString(row.user_id),
  environment: requireGreptimeString(row.environment, "traces.environment"),
  sessionId: greptimeString(row.session_id),
  public: greptimeBool(row.public),
});
