import { prisma } from "../../../db";
import { type FilterState } from "../../../types";
import { type NumericEventsTableColumnId } from "../../../eventsTable";
import { eventsTableCols } from "../../../eventsTable";
import { greptimeQuery } from "../../greptime/client";
import { FilterList, StringFilter } from "../../greptime/sql/greptime-filter";
import { createGreptimeFilterFromFilterState } from "../../greptime/sql/factory";
import { observationsTableGreptimeColumnDefinitions } from "../../greptime/sql/columnMappings";
import { greptimeJson, selectJsonColumn } from "../../greptime/sql/rowContract";
import { notDeleted } from "./queryHelpers";
import {
  getExperimentDatasetIdsGreptime,
  getExperimentNamesGreptime,
} from "./experiments";

/**
 * GreptimeDB events "grouped-by" facet reads (04-read-path.md, P5). Events are observation-grain, so
 * the faithful collapse groups the merged `observations` projection (alias `o`); a `traces t` LEFT
 * JOIN is added only when grouping a trace-denormalized column (userId/sessionId/traceName).
 *
 * The facet `FilterState` is BOUNDED: a Start Time datetime lower-bound, optionally a `type` string
 * equality, and optionally the two events-only booleans `isRootObservation` / `hasParentObservation`.
 * The booleans are pre-extracted and emitted as raw `parent_observation_id` predicates; the remaining
 * filters resolve through the observations filter factory (a "column not found" throw is the desired
 * loud failure for anything outside the bounded set).
 */

const HAS_PARENT =
  "(o.parent_observation_id IS NOT NULL AND o.parent_observation_id != '')";
const NO_PARENT =
  "(o.parent_observation_id IS NULL OR o.parent_observation_id = '')";

// Match keys for the two events-only boolean facets (uiTableName + uiTableId, per mapEventsTable.ts).
const HAS_PARENT_KEYS = new Set([
  "Has Parent Observation",
  "hasParentObservation",
]);
const IS_ROOT_KEYS = new Set(["Is Root Observation", "isRootObservation"]);

type FacetWhere = { where: string; params: Record<string, unknown> };

const buildEventsFacetWhere = (
  projectId: string,
  filter: FilterState,
): FacetWhere => {
  const rawPredicates: string[] = [];
  const passthrough: FilterState = [];

  for (const f of filter) {
    if (HAS_PARENT_KEYS.has(f.column) && f.type === "boolean") {
      rawPredicates.push(f.value ? HAS_PARENT : NO_PARENT);
      continue;
    }
    if (IS_ROOT_KEYS.has(f.column) && f.type === "boolean") {
      rawPredicates.push(f.value ? NO_PARENT : HAS_PARENT);
      continue;
    }
    passthrough.push(f);
  }

  const list = new FilterList([
    new StringFilter({
      table: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
    ...createGreptimeFilterFromFilterState(
      passthrough,
      observationsTableGreptimeColumnDefinitions,
      eventsTableCols,
    ),
  ]);
  const applied = list.apply();

  const where = [applied.query, notDeleted("o"), ...rawPredicates]
    .filter(Boolean)
    .join(" AND ");
  return { where, params: applied.params };
};

type GroupedEventsFilterOptions = {
  limit?: number;
  offset?: number;
  orderBy?: string;
};

type GroupEventsArgs = {
  projectId: string;
  filter: FilterState;
  groupExpr: string;
  traceJoin?: boolean;
  notNullExpr?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
};

const TRACE_JOIN = `LEFT JOIN traces t ON t.id = o.trace_id AND t.project_id = o.project_id AND ${notDeleted("t")}`;

const groupEventsObservationsBy = async ({
  projectId,
  filter,
  groupExpr,
  traceJoin = false,
  notNullExpr,
  limit,
  offset,
  orderBy,
}: GroupEventsArgs): Promise<{ value: string; count: string }[]> => {
  const facet = buildEventsFacetWhere(projectId, filter);
  const notNull = notNullExpr
    ? ` AND ${notNullExpr} IS NOT NULL AND ${notNullExpr} != ''`
    : "";
  return greptimeQuery<{ value: string; count: string }>({
    query: `
      SELECT ${groupExpr} AS value, count(*) AS count
      FROM observations o
      ${traceJoin ? TRACE_JOIN : ""}
      WHERE ${facet.where}${notNull}
      GROUP BY ${groupExpr}
      ${orderBy ?? "ORDER BY count(*) DESC"}
      LIMIT :limit OFFSET :offset`,
    params: { ...facet.params, limit: limit ?? 1000, offset: offset ?? 0 },
    readOnly: true,
  });
};

// ---------------------------------------------------------------------------
// plain column facets
// ---------------------------------------------------------------------------

export const getEventsGroupedByModelGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  const rows = await groupEventsObservationsBy({
    projectId,
    filter,
    groupExpr: "o.provided_model_name",
    notNullExpr: "o.provided_model_name",
    ...opts,
  });
  return rows.map((r) => ({ model: r.value, count: Number(r.count) }));
};

export const getEventsGroupedByModelIdGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  const rows = await groupEventsObservationsBy({
    projectId,
    filter,
    groupExpr: "o.internal_model_id",
    notNullExpr: "o.internal_model_id",
    ...opts,
  });
  return rows.map((r) => ({ modelId: r.value, count: Number(r.count) }));
};

export const getEventsGroupedByNameGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  const rows = await groupEventsObservationsBy({
    projectId,
    filter,
    groupExpr: "o.name",
    notNullExpr: "o.name",
    ...opts,
  });
  return rows.map((r) => ({ name: r.value, count: Number(r.count) }));
};

export const getEventsGroupedByTraceNameGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  const rows = await groupEventsObservationsBy({
    projectId,
    filter,
    groupExpr: "t.name",
    traceJoin: true,
    notNullExpr: "t.name",
    ...opts,
  });
  return rows.map((r) => ({ traceName: r.value, count: Number(r.count) }));
};

export const getEventsGroupedByTypeGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  const rows = await groupEventsObservationsBy({
    projectId,
    filter,
    groupExpr: "o.type",
    notNullExpr: "o.type",
    ...opts,
  });
  return rows.map((r) => ({ type: r.value, count: Number(r.count) }));
};

export const getEventsGroupedByUserIdGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  const rows = await groupEventsObservationsBy({
    projectId,
    filter,
    groupExpr: "t.user_id",
    traceJoin: true,
    notNullExpr: "t.user_id",
    ...opts,
  });
  return rows.map((r) => ({ userId: r.value, count: Number(r.count) }));
};

export const getEventsGroupedByVersionGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  const rows = await groupEventsObservationsBy({
    projectId,
    filter,
    groupExpr: "o.version",
    notNullExpr: "o.version",
    ...opts,
  });
  return rows.map((r) => ({ version: r.value, count: Number(r.count) }));
};

export const getEventsGroupedBySessionIdGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  const rows = await groupEventsObservationsBy({
    projectId,
    filter,
    groupExpr: "t.session_id",
    traceJoin: true,
    notNullExpr: "t.session_id",
    ...opts,
  });
  return rows.map((r) => ({ sessionId: r.value, count: Number(r.count) }));
};

export const getEventsGroupedByLevelGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  const rows = await groupEventsObservationsBy({
    projectId,
    filter,
    groupExpr: "o.level",
    notNullExpr: "o.level",
    ...opts,
  });
  return rows.map((r) => ({ level: r.value, count: Number(r.count) }));
};

export const getEventsGroupedByEnvironmentGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  const rows = await groupEventsObservationsBy({
    projectId,
    filter,
    groupExpr: "o.environment",
    notNullExpr: "o.environment",
    ...opts,
  });
  return rows.map((r) => ({ environment: r.value, count: Number(r.count) }));
};

// ---------------------------------------------------------------------------
// parent-pointer boolean facets (LIMIT default 2, no notNull)
// ---------------------------------------------------------------------------

export const getEventsGroupedByHasParentObservationGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  const rows = await groupEventsObservationsBy({
    projectId,
    filter,
    groupExpr: HAS_PARENT,
    orderBy: opts?.orderBy,
    limit: opts?.limit ?? 2,
    offset: opts?.offset,
  });
  return rows.map((r) => ({
    hasParentObservation: Boolean(Number(r.value)),
    count: Number(r.count),
  }));
};

export const getEventsGroupedByIsRootObservationGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  const rows = await groupEventsObservationsBy({
    projectId,
    filter,
    groupExpr: NO_PARENT,
    orderBy: opts?.orderBy,
    limit: opts?.limit ?? 2,
    offset: opts?.offset,
  });
  return rows.map((r) => ({
    isRootObservation: Boolean(Number(r.value)),
    count: Number(r.count),
  }));
};

// ---------------------------------------------------------------------------
// prompt name (group prompt_id, resolve names from Postgres)
// ---------------------------------------------------------------------------

export const getEventsGroupedByPromptNameGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: GroupedEventsFilterOptions,
) => {
  const facet = buildEventsFacetWhere(projectId, filter);
  const rows = await greptimeQuery<{ id: string }>({
    query: `
      SELECT o.prompt_id AS id, count(*) AS count
      FROM observations o
      WHERE ${facet.where} AND o.prompt_id IS NOT NULL AND o.prompt_id != ''
      GROUP BY o.prompt_id
      ${opts?.orderBy ?? "ORDER BY count(*) DESC"}
      LIMIT :limit OFFSET :offset`,
    params: {
      ...facet.params,
      limit: opts?.limit ?? 1000,
      offset: opts?.offset ?? 0,
    },
    readOnly: true,
  });
  const promptIds = rows
    .map((r) => r.id)
    .filter((id): id is string => Boolean(id));
  const prompts =
    promptIds.length > 0
      ? await prisma.prompt.findMany({
          select: { id: true, name: true },
          where: { id: { in: promptIds }, projectId },
        })
      : [];
  return prompts.map((p) => ({ promptName: p.name }));
};

// ---------------------------------------------------------------------------
// trace tags (distinct trace tags reachable from the facet-matched observations)
// ---------------------------------------------------------------------------

export const getEventsGroupedByTraceTagsGreptime = async (
  projectId: string,
  filter: FilterState,
  opts?: Pick<GroupedEventsFilterOptions, "limit" | "offset">,
) => {
  const facet = buildEventsFacetWhere(projectId, filter);
  return greptimeQuery<{ tag: string }>({
    query: `
      SELECT DISTINCT tt.tag AS tag
      FROM traces_tags tt
      WHERE tt.project_id = :projectId
        AND ${notDeleted("tt")}
        AND EXISTS (
          SELECT 1 FROM observations o
          WHERE o.project_id = tt.project_id
            AND o.trace_id = tt.entity_id
            AND ${facet.where}
        )
      LIMIT :limit OFFSET :offset`,
    params: {
      projectId,
      ...facet.params,
      limit: opts?.limit ?? 1000,
      offset: opts?.offset ?? 0,
    },
    readOnly: true,
  }).then((rows) => rows.map((r) => ({ tag: r.tag })));
};

// ---------------------------------------------------------------------------
// tool facets (app-side JSON explode; GreptimeDB cannot unnest dynamic JSON keys/arrays)
// ---------------------------------------------------------------------------

const TOOL_SCAN_LIMIT = 10000;

const topToolCounts = (
  counts: Map<string, number>,
): { name: string; count: number }[] =>
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1000)
    .map(([name, count]) => ({ name, count }));

export const getEventsGroupedByToolNameGreptime = async (
  projectId: string,
  filter: FilterState,
) => {
  const facet = buildEventsFacetWhere(projectId, filter);
  const rows = await greptimeQuery<{ tool_definitions: unknown }>({
    query: `
      SELECT ${selectJsonColumn("tool_definitions", { tablePrefix: "o" })}
      FROM observations o
      WHERE ${facet.where}
      LIMIT ${TOOL_SCAN_LIMIT}`,
    params: facet.params,
    readOnly: true,
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const defs = greptimeJson<Record<string, unknown>>(
      row.tool_definitions,
      {},
    );
    for (const key of Object.keys(defs ?? {})) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return topToolCounts(counts).map((r) => ({
    toolName: r.name,
    count: r.count,
  }));
};

export const getEventsGroupedByCalledToolNameGreptime = async (
  projectId: string,
  filter: FilterState,
) => {
  const facet = buildEventsFacetWhere(projectId, filter);
  const rows = await greptimeQuery<{ tool_call_names: unknown }>({
    query: `
      SELECT ${selectJsonColumn("tool_call_names", { tablePrefix: "o" })}
      FROM observations o
      WHERE ${facet.where}
      LIMIT ${TOOL_SCAN_LIMIT}`,
    params: facet.params,
    readOnly: true,
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const names = greptimeJson<unknown[]>(row.tool_call_names, []);
    for (const name of names ?? []) {
      if (typeof name === "string") {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
  }
  return topToolCounts(counts).map((r) => ({
    calledToolName: r.name,
    count: r.count,
  }));
};

// ---------------------------------------------------------------------------
// experiment facets (delegate to the dedicated dataset_run_items readers)
// ---------------------------------------------------------------------------

const extractStartTimeFilter = (filter: FilterState): FilterState =>
  filter.filter(
    (f) =>
      f.column === "Start Time" &&
      (f.operator === ">=" || f.operator === ">") &&
      f.type === "datetime",
  );

export const getEventsGroupedByExperimentDatasetIdGreptime = async (
  projectId: string,
  filter: FilterState,
) => {
  const startTimeFilter = extractStartTimeFilter(filter);
  const rows = await getExperimentDatasetIdsGreptime(
    projectId,
    startTimeFilter.length > 0 ? startTimeFilter : undefined,
  );
  return rows.map((r) => ({ experimentDatasetId: r.experimentDatasetId }));
};

export const getEventsGroupedByExperimentIdGreptime = async (
  projectId: string,
  _filter: FilterState,
) => {
  const rows = await getExperimentNamesGreptime({ projectId });
  return rows.map((r) => ({ experimentId: r.experimentId }));
};

export const getEventsGroupedByExperimentNameGreptime = async (
  projectId: string,
  _filter: FilterState,
) => {
  const rows = await getExperimentNamesGreptime({ projectId });
  return rows.map((r) => ({ experimentName: r.experimentName }));
};

// ---------------------------------------------------------------------------
// numeric stats (min / max / avg / count over a numeric observations expression)
// ---------------------------------------------------------------------------

type NumericStatsColumnId = Exclude<
  NumericEventsTableColumnId,
  "inputTokens" | "outputTokens" | "inputCost" | "outputCost"
>;

// Numeric greptime expressions (alias `o`), reusing the units from observationsTable.ts
// (latency / time-to-first-token in SECONDS; cost/tokens from the native JSON maps).
const OBS_SECONDS = "(to_unixtime(o.end_time) - to_unixtime(o.start_time))";
const NUMERIC_EXPR: Partial<Record<NumericStatsColumnId, string>> = {
  totalCost: "o.total_cost",
  totalTokens: "json_get_float(o.usage_details, 'total')",
  latency: OBS_SECONDS,
  timeToFirstToken:
    "(to_unixtime(o.completion_start_time) - to_unixtime(o.start_time))",
  tokensPerSecond: `(json_get_float(o.usage_details, 'output') / NULLIF(${OBS_SECONDS}, 0))`,
};

export const getEventsNumericStatsByFilterColumnGreptime = async (
  projectId: string,
  filter: FilterState,
  columnId: NumericStatsColumnId,
): Promise<{
  min: number;
  max: number;
  avg: number;
  count: number;
} | null> => {
  const expr = NUMERIC_EXPR[columnId];
  if (!expr) {
    throw new Error(`Column ${columnId} is not supported for numeric stats`);
  }
  const facet = buildEventsFacetWhere(projectId, filter);
  const rows = await greptimeQuery<{
    min: string | number | null;
    max: string | number | null;
    avg: string | number | null;
    count: string | number;
  }>({
    query: `
      SELECT min(${expr}) AS min, max(${expr}) AS max, avg(${expr}) AS avg,
        count(*) AS count
      FROM observations o
      WHERE ${facet.where}`,
    params: facet.params,
    readOnly: true,
  });
  const row = rows[0];
  if (!row || Number(row.count) === 0) return null;
  if (row.min == null || row.max == null || row.avg == null) return null;
  return {
    min: Number(row.min),
    max: Number(row.max),
    avg: Number(row.avg),
    count: Number(row.count),
  };
};
