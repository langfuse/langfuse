import Decimal from "decimal.js";

import { DatasetRunItemDomain } from "../../../domain/dataset-run-items";
import { InvalidRequestError } from "../../../errors";
import { type FilterState } from "../../../types";
import { type OrderByState } from "../../../interfaces/orderBy";
import { datasetRunItemsTableCols } from "../../../tableDefinitions/datasetRunItemsTable";
import { greptimeQuery } from "../../greptime/client";
import { createGreptimeFilterFromFilterState } from "../../greptime/sql/factory";
import { FilterList } from "../../greptime/sql/greptime-filter";
import { greptimeOrderBySql } from "../../greptime/sql/orderby";
import {
  datasetRunItemsTableGreptimeColumnDefinitions,
  datasetRunsTableGreptimeColumnDefinitions,
} from "../../greptime/sql/datasetColumnMappings";
import {
  greptimeDate,
  greptimeJson,
  greptimeString,
  requireGreptimeDate,
  requireGreptimeString,
  selectJsonColumn,
} from "../../greptime/sql/rowContract";
import { quoteIdent } from "../../greptime/schemaUtils";
import { parseMetadataCHRecordToDomain } from "../../utils/metadata_conversion";
import { greptimeInClause, greptimeTsParam, notDeleted } from "./queryHelpers";

/**
 * GreptimeDB dataset-run-items reads (04-read-path.md, P4). Replaces the ClickHouse
 * `dataset_run_items_rmt` reads in `repositories/dataset-run-items.ts`, reading the merged
 * `dataset_run_items` projection (written by the GAP-DRI mini-02 path).
 *
 * Core dedup contract: the projection PK is `(project_id, id)`, which does NOT make the logical key
 * `(dataset_id, dataset_run_id, dataset_item_id)` unique (the same logical run item can re-ingest
 * under a new id). Every read therefore dedups to the latest row per logical key with
 * `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY created_at DESC) = 1` (GreptimeDB has no QUALIFY, so
 * the rank is filtered in an outer query) — this replaces the ClickHouse `LIMIT 1 BY` and is a
 * contract, not a fallback. Counts use `count(DISTINCT concat(...))` over the logical key, since
 * GreptimeDB rejects multi-column `count(DISTINCT a, b, ...)`.
 *
 * Score filters split by grain: dataset-run-ITEM reads correlate to `scores` row-by-row by the item's
 * `trace_id` (standard score-grain EXISTS, via the filter factory). Dataset-RUN reads aggregate per
 * run, so the outer row has no single trace_id; their score filter is a dedicated run-level EXISTS
 * (scores joined to the run's traces through `dataset_run_items`).
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// public return types (re-exported by repositories/dataset-run-items.ts)
// ---------------------------------------------------------------------------

export type DatasetRunsMetrics = {
  id: string;
  name: string;
  projectId: string;
  datasetId: string;
  countRunItems: number;
  avgTotalCost: Decimal;
  totalCost: Decimal;
  avgLatency: number;
  aggScoresAvg: Array<[string, number]>;
  aggScoreCategories: string[];
};

export type DatasetRunsRows = {
  id: string;
  name: string;
  projectId: string;
  createdAt: Date;
  datasetId: string;
  description: string;
  metadata: string;
};

export type DatasetRunsMetricsTableQuery = {
  projectId: string;
  datasetId: string;
  filter: FilterState;
  runIds?: string[];
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
};

export type DatasetRunItemsTableQuery = {
  projectId: string;
  filter: FilterState;
  datasetId?: string;
  orderBy?: OrderByState | OrderByState[];
  limit?: number;
  offset?: number;
};

export type DatasetRunItemsByDatasetIdQuery = Omit<
  DatasetRunItemsTableQuery,
  "datasetId"
> & { datasetId: string };

export type DatasetItemsWithRunDataQuery = {
  projectId: string;
  datasetId: string;
  runIds: string[];
  filterByRun: { runId: string; filters: FilterState }[];
  limit?: number;
  offset?: number;
};

export type DatasetRunItemsByItemIdsWithoutIOQuery = {
  projectId: string;
  datasetId: string;
  runIds: string[];
  datasetItemIds: string[];
};

export type DatasetItemIdsByTraceIdQuery = {
  projectId: string;
  traceId: string;
  filter: FilterState;
};

// ---------------------------------------------------------------------------
// row -> domain
// ---------------------------------------------------------------------------

// All projection columns; the ROW_NUMBER subquery selects these so the outer query can both dedup
// and project. JSON columns stay JSON here and are serialized with `json_to_string` only in the
// final SELECT (a bare JSON column read returns jsonb bytes — see rowContract).
const DRI_BASE_COLUMNS = [
  "id",
  "project_id",
  "trace_id",
  "observation_id",
  "dataset_id",
  "dataset_run_id",
  "dataset_item_id",
  "error",
  "dataset_run_name",
  "dataset_run_description",
  "dataset_run_created_at",
  "dataset_item_version",
  "created_at",
  "updated_at",
] as const;

const DRI_JSON_COLUMNS = [
  "dataset_run_metadata",
  "dataset_item_metadata",
] as const;
const DRI_STRING_IO_COLUMNS = [
  "dataset_item_input",
  "dataset_item_expected_output",
] as const;

/**
 * Convert a GreptimeDB `dataset_run_items` row to the domain. `includeIO` decides whether the IO /
 * metadata columns were projected (the SELECT omits them for slim reads). mysql2 already returns
 * TIMESTAMP as Date; JSON columns arrive `json_to_string`-serialized and are parsed with the pure
 * `parseMetadataCHRecordToDomain` key-walk.
 */
export function convertGreptimeRowToDatasetRunItemDomain(
  row: Record<string, unknown>,
  includeIO: true,
): DatasetRunItemDomain<true>;
export function convertGreptimeRowToDatasetRunItemDomain(
  row: Record<string, unknown>,
  includeIO: false,
): DatasetRunItemDomain<false>;
export function convertGreptimeRowToDatasetRunItemDomain(
  row: Record<string, unknown>,
  includeIO: boolean,
): DatasetRunItemDomain<boolean> {
  const base = {
    id: requireGreptimeString(row.id, "dataset_run_items.id"),
    projectId: requireGreptimeString(
      row.project_id,
      "dataset_run_items.project_id",
    ),
    traceId: requireGreptimeString(row.trace_id, "dataset_run_items.trace_id"),
    observationId: greptimeString(row.observation_id),
    datasetRunId: requireGreptimeString(
      row.dataset_run_id,
      "dataset_run_items.dataset_run_id",
    ),
    datasetRunName: requireGreptimeString(
      row.dataset_run_name,
      "dataset_run_items.dataset_run_name",
    ),
    datasetRunDescription: greptimeString(row.dataset_run_description),
    datasetRunCreatedAt: requireGreptimeDate(
      row.dataset_run_created_at,
      "dataset_run_items.dataset_run_created_at",
    ),
    datasetItemId: requireGreptimeString(
      row.dataset_item_id,
      "dataset_run_items.dataset_item_id",
    ),
    datasetItemVersion: greptimeDate(row.dataset_item_version),
    createdAt: requireGreptimeDate(
      row.created_at,
      "dataset_run_items.created_at",
    ),
    updatedAt: requireGreptimeDate(
      row.updated_at,
      "dataset_run_items.updated_at",
    ),
    datasetId: requireGreptimeString(
      row.dataset_id,
      "dataset_run_items.dataset_id",
    ),
    error: greptimeString(row.error),
  };

  if (includeIO) {
    return {
      ...base,
      datasetRunMetadata:
        parseMetadataCHRecordToDomain(
          greptimeJson<Record<string, string>>(row.dataset_run_metadata, {}),
        ) ?? null,
      datasetItemInput: greptimeString(row.dataset_item_input),
      datasetItemExpectedOutput: greptimeString(
        row.dataset_item_expected_output,
      ),
      datasetItemMetadata: parseMetadataCHRecordToDomain(
        greptimeJson<Record<string, string>>(row.dataset_item_metadata, {}),
      ),
    } as DatasetRunItemDomain<true>;
  }
  return base as DatasetRunItemDomain<false>;
}

// ---------------------------------------------------------------------------
// shared SQL fragments
// ---------------------------------------------------------------------------

/** Base scope predicate (project [+ dataset] [+ runIds]) on the raw `dataset_run_items` table. */
const baseScope = (opts: {
  projectId: string;
  datasetId?: string;
  runIds?: string[];
  prefix?: string;
}): { sql: string; params: Record<string, unknown> } => {
  const p = opts.prefix ? `${opts.prefix}.` : "";
  const parts = [`${p}project_id = :projectId`];
  const params: Record<string, unknown> = { projectId: opts.projectId };
  if (opts.datasetId !== undefined) {
    parts.push(`${p}dataset_id = :datasetId`);
    params.datasetId = opts.datasetId;
  }
  if (opts.runIds && opts.runIds.length > 0) {
    const inClause = greptimeInClause(
      `${p}dataset_run_id`,
      opts.runIds,
      "runid",
    );
    parts.push(inClause.sql);
    Object.assign(params, inClause.params);
  }
  parts.push(notDeleted(opts.prefix));
  return { sql: parts.join(" AND "), params };
};

/**
 * Dedup CTE body: latest row per logical key. Selects the requested columns plus a `rn` and is
 * wrapped by callers in `(...) x WHERE x.rn = 1`. `whereSql` is the inner scope (already compiled).
 */
const dedupSubquery = (opts: {
  columns: readonly string[];
  whereSql: string;
}): string =>
  `SELECT ${opts.columns
    .map((c) => quoteIdent(c))
    .join(", ")}, ROW_NUMBER() OVER (` +
  `PARTITION BY ${quoteIdent("project_id")}, ${quoteIdent("dataset_id")}, ` +
  `${quoteIdent("dataset_run_id")}, ${quoteIdent("dataset_item_id")} ` +
  `ORDER BY ${quoteIdent("created_at")} DESC) AS rn ` +
  // Aliased `dri` so `dri.`-prefixed user filters resolve; unqualified base/partition columns still
  // resolve on the single table.
  `FROM ${quoteIdent("dataset_run_items")} dri WHERE ${opts.whereSql}`;

const LOGICAL_KEY_CONCAT =
  `concat(CAST(project_id AS STRING), '-', CAST(dataset_id AS STRING), '-', ` +
  `CAST(dataset_run_id AS STRING), '-', CAST(dataset_item_id AS STRING))`;

// ---------------------------------------------------------------------------
// dataset run ITEMS reads (row-grain; score filters via standard trace-grain EXISTS)
// ---------------------------------------------------------------------------

const itemsSelectColumns = (includeIO: boolean): string => {
  const cols = DRI_BASE_COLUMNS.map(
    (c) => `dri.${quoteIdent(c)} AS ${quoteIdent(c)}`,
  );
  if (includeIO) {
    for (const c of DRI_STRING_IO_COLUMNS) {
      cols.push(`dri.${quoteIdent(c)} AS ${quoteIdent(c)}`);
    }
    for (const c of DRI_JSON_COLUMNS) {
      cols.push(selectJsonColumn(c, { tablePrefix: "dri" }));
    }
  }
  return cols.join(", ");
};

type ItemsInternalOpts = DatasetRunItemsTableQuery & {
  select: "count" | "rows";
  includeIO?: boolean;
};

const getDatasetRunItemsTableInternalGreptime = async <T>(
  opts: ItemsInternalOpts,
): Promise<T[]> => {
  const { projectId, datasetId, filter, orderBy, limit, offset } = opts;
  const includeIO = opts.includeIO ?? true;

  // user filters resolve against the item-grain mapping (plain columns -> dri; score columns ->
  // correlated trace-grain EXISTS, self-contained in the WHERE — no scores join needed).
  const userFilter = new FilterList(
    createGreptimeFilterFromFilterState(
      filter,
      datasetRunItemsTableGreptimeColumnDefinitions,
      datasetRunItemsTableCols,
    ),
  ).apply();

  const scope = baseScope({ projectId, datasetId, prefix: undefined });
  const innerWhere = [scope.sql, userFilter.query]
    .filter(Boolean)
    .join(" AND ");
  const columns =
    opts.select === "rows"
      ? includeIO
        ? [...DRI_BASE_COLUMNS, ...DRI_STRING_IO_COLUMNS, ...DRI_JSON_COLUMNS]
        : DRI_BASE_COLUMNS
      : DRI_BASE_COLUMNS;
  const dedup = dedupSubquery({ columns, whereSql: innerWhere });
  const params = { ...scope.params, ...userFilter.params };

  if (opts.select === "count") {
    const rows = await greptimeQuery<{ count: string | number }>({
      query: `SELECT count(DISTINCT ${LOGICAL_KEY_CONCAT}) AS count FROM (${dedup}) dri WHERE dri.rn = 1`,
      params,
      readOnly: true,
    });
    return rows as T[];
  }

  const orderClause = greptimeOrderBySql(
    orderBy ?? [],
    datasetRunItemsTableGreptimeColumnDefinitions,
  );
  const pagination =
    limit !== undefined && offset !== undefined
      ? "LIMIT :limit OFFSET :offset"
      : "";
  const paginationParams =
    limit !== undefined && offset !== undefined ? { limit, offset } : {};

  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      SELECT ${itemsSelectColumns(includeIO)}
      FROM (${dedup}) dri
      WHERE dri.rn = 1
      ${orderClause}
      ${pagination}`,
    params: { ...params, ...paginationParams },
    readOnly: true,
  });
  return rows as T[];
};

export const getDatasetRunItemsGreptime = async (
  opts: DatasetRunItemsTableQuery,
): Promise<DatasetRunItemDomain[]> => {
  const rows = await getDatasetRunItemsTableInternalGreptime<
    Record<string, unknown>
  >({
    ...opts,
    select: "rows",
    includeIO: true,
  });
  return rows.map((row) => convertGreptimeRowToDatasetRunItemDomain(row, true));
};

export const getDatasetRunItemsByDatasetIdGreptime = async (
  opts: DatasetRunItemsByDatasetIdQuery,
): Promise<DatasetRunItemDomain[]> => getDatasetRunItemsGreptime(opts);

export const getDatasetRunItemsCountGreptime = async (
  opts: DatasetRunItemsTableQuery,
): Promise<number> => {
  const rows = await getDatasetRunItemsTableInternalGreptime<{ count: string }>(
    {
      ...opts,
      select: "count",
    },
  );
  return Number(rows[0]?.count ?? 0);
};

export const getDatasetRunItemsCountByDatasetIdGreptime = async (
  opts: DatasetRunItemsByDatasetIdQuery,
): Promise<number> => getDatasetRunItemsCountGreptime(opts);

export const getDatasetRunItemsWithoutIOByItemIdsGreptime = async (
  opts: DatasetRunItemsByItemIdsWithoutIOQuery,
): Promise<DatasetRunItemDomain<false>[]> => {
  const { datasetItemIds, runIds, projectId, datasetId } = opts;
  const filter: FilterState = [
    {
      column: "datasetItemId",
      operator: "any of",
      value: datasetItemIds,
      type: "stringOptions" as const,
    },
    {
      column: "datasetRunId",
      operator: "any of",
      value: runIds,
      type: "stringOptions" as const,
    },
  ];
  const rows = await getDatasetRunItemsTableInternalGreptime<
    Record<string, unknown>
  >({
    projectId,
    datasetId,
    filter,
    select: "rows",
    includeIO: false,
  });
  return rows.map((row) =>
    convertGreptimeRowToDatasetRunItemDomain(row, false),
  );
};

// ---------------------------------------------------------------------------
// dataset item ids by trace id
// ---------------------------------------------------------------------------

export const getDatasetItemIdsByTraceIdGreptime = async (
  opts: DatasetItemIdsByTraceIdQuery,
): Promise<
  { id: string; datasetId: string; observationId: string | null }[]
> => {
  const { projectId, traceId, filter } = opts;
  const userFilter = new FilterList(
    createGreptimeFilterFromFilterState(
      filter,
      datasetRunItemsTableGreptimeColumnDefinitions,
      datasetRunItemsTableCols,
    ),
  ).apply();

  const innerWhere = [
    "project_id = :projectId",
    "trace_id = :traceId",
    notDeleted(),
    userFilter.query,
  ]
    .filter(Boolean)
    .join(" AND ");
  const dedup = dedupSubquery({
    columns: ["dataset_item_id", "observation_id", "dataset_id"],
    whereSql: innerWhere,
  });

  const rows = await greptimeQuery<{
    dataset_item_id: string;
    observation_id: string | null;
    dataset_id: string;
  }>({
    query: `
      SELECT dri.dataset_item_id AS dataset_item_id, dri.observation_id AS observation_id, dri.dataset_id AS dataset_id
      FROM (${dedup}) dri
      WHERE dri.rn = 1`,
    params: { projectId, traceId, ...userFilter.params },
    readOnly: true,
  });

  return rows.map((r) => ({
    id: r.dataset_item_id,
    observationId: r.observation_id ?? null,
    datasetId: r.dataset_id,
  }));
};

// ---------------------------------------------------------------------------
// multi-run intersection (dataset items qualifying across ALL runs)
// ---------------------------------------------------------------------------

const getQualifyingDatasetItemsGreptime = async <T>(opts: {
  select: "count" | "rows";
  projectId: string;
  datasetId: string;
  runIds: string[];
  runFilters: { runId: string; filters: FilterState }[];
  limit?: number;
  offset?: number;
}): Promise<T[]> => {
  const { select, projectId, datasetId, runIds, runFilters, limit, offset } =
    opts;
  if (runIds.length === 0) return [];

  const scope = baseScope({ projectId, datasetId, prefix: undefined });
  const params: Record<string, unknown> = { ...scope.params };

  // Per-run OR-combined predicate: each run = `dataset_run_id = :rid AND <that run's user filters>`.
  const orParts: string[] = [];
  const seen = new Set<string>();
  let idx = 0;
  for (const rf of runFilters) {
    const ridParam = `qrid${idx}`;
    params[ridParam] = rf.runId;
    seen.add(rf.runId);
    const userFilter = new FilterList(
      createGreptimeFilterFromFilterState(
        rf.filters,
        datasetRunItemsTableGreptimeColumnDefinitions,
        datasetRunItemsTableCols,
      ),
    ).apply();
    Object.assign(params, userFilter.params);
    const cond = [`dataset_run_id = :${ridParam}`, userFilter.query]
      .filter(Boolean)
      .join(" AND ");
    orParts.push(`(${cond})`);
    idx += 1;
  }
  // runs without explicit filters still participate in the intersection (membership only).
  for (const runId of runIds) {
    if (seen.has(runId)) continue;
    const ridParam = `qrid${idx}`;
    params[ridParam] = runId;
    orParts.push(`(dataset_run_id = :${ridParam})`);
    idx += 1;
  }

  const innerWhere = [
    scope.sql,
    orParts.length ? `(${orParts.join(" OR ")})` : "",
  ]
    .filter(Boolean)
    .join(" AND ");
  // Dedup first so a logical item with multiple ids isn't counted as multiple run memberships.
  const dedup = dedupSubquery({
    columns: ["dataset_item_id", "dataset_run_id"],
    whereSql: innerWhere,
  });

  params.totalRunCount = runIds.length;
  const selectExpr =
    select === "count"
      ? "count(DISTINCT dataset_item_id) AS count"
      : "dataset_item_id";
  const pagination =
    limit !== undefined && offset !== undefined
      ? "LIMIT :limit OFFSET :offset"
      : "";
  if (limit !== undefined && offset !== undefined) {
    params.limit = limit;
    params.offset = offset;
  }

  const rows = await greptimeQuery<T>({
    query: `
      WITH run_qualified_items AS (
        SELECT DISTINCT dataset_item_id, dataset_run_id
        FROM (${dedup}) dri
        WHERE dri.rn = 1
      ),
      intersection_items AS (
        SELECT dataset_item_id
        FROM run_qualified_items
        GROUP BY dataset_item_id
        HAVING count(DISTINCT dataset_run_id) = :totalRunCount
      )
      SELECT ${selectExpr}
      FROM intersection_items
      ${select === "count" ? "" : "ORDER BY dataset_item_id"}
      ${pagination}`,
    params,
    readOnly: true,
  });
  return rows as T[];
};

export const getDatasetItemsWithRunDataCountGreptime = async (
  opts: DatasetItemsWithRunDataQuery,
): Promise<number> => {
  const rows = await getQualifyingDatasetItemsGreptime<{ count: string }>({
    select: "count",
    projectId: opts.projectId,
    datasetId: opts.datasetId,
    runIds: opts.runIds,
    runFilters: opts.filterByRun,
  });
  return Number(rows[0]?.count ?? 0);
};

export const getDatasetItemIdsWithRunDataGreptime = async (
  opts: DatasetItemsWithRunDataQuery,
): Promise<string[]> => {
  const rows = await getQualifyingDatasetItemsGreptime<{
    dataset_item_id: string;
  }>({
    select: "rows",
    projectId: opts.projectId,
    datasetId: opts.datasetId,
    runIds: opts.runIds,
    runFilters: opts.filterByRun,
    limit: opts.limit,
    offset: opts.offset,
  });
  return rows.map((r) => r.dataset_item_id);
};

// ---------------------------------------------------------------------------
// existence / analytics
// ---------------------------------------------------------------------------

export const hasAnyDatasetRunItemGreptime = async (
  projectId: string,
): Promise<boolean> => {
  const rows = await greptimeQuery<{ one: number }>({
    query: `SELECT 1 AS one FROM ${quoteIdent("dataset_run_items")} WHERE project_id = :projectId AND ${notDeleted()} LIMIT 1`,
    params: { projectId },
    readOnly: true,
  });
  return rows.length > 0;
};

export const getDatasetRunItemCountsByProjectInCreationIntervalGreptime =
  async ({
    start,
    end,
  }: {
    start: Date;
    end: Date;
  }): Promise<{ projectId: string; count: number }[]> => {
    // count distinct logical items (a logical item with multiple ids must not inflate the count).
    const rows = await greptimeQuery<{ project_id: string; count: string }>({
      query: `
      SELECT project_id, count(DISTINCT ${LOGICAL_KEY_CONCAT}) AS count
      FROM ${quoteIdent("dataset_run_items")}
      WHERE created_at >= :start AND created_at < :end AND ${notDeleted()}
      GROUP BY project_id`,
      params: { start: greptimeTsParam(start), end: greptimeTsParam(end) },
      readOnly: true,
    });
    return rows.map((r) => ({
      projectId: r.project_id,
      count: Number(r.count),
    }));
  };

// ---------------------------------------------------------------------------
// dataset RUNS reads (run-grain; score filters via a dedicated run-level EXISTS)
// ---------------------------------------------------------------------------

const NUMERIC_SCORE_OPS = new Set([">", "<", ">=", "<=", "=", "!="]);

const q = (col: string) => quoteIdent(col);

/** `cs.trace_id IN (the run's distinct trace ids)` correlated to the outer run row. */
const runTraceIdSubquery = (outerPrefix: string): string =>
  `${q("trace_id")} IN (SELECT ${q("trace_id")} FROM ${q("dataset_run_items")} d ` +
  `WHERE d.${q("project_id")} = ${outerPrefix}.${q("project_id")} ` +
  `AND d.${q("dataset_run_id")} = ${outerPrefix}.${q("dataset_run_id")} ` +
  `AND d.${q("is_deleted")} = false)`;

/**
 * Run-level score filter: scores correlated to a run through `dataset_run_items` (the runs grain has
 * no single trace_id, so the standard row-level score-grain EXISTS does not apply). Only the two
 * score columns are filterable on the runs table (`datasetRunsTableCols`); other columns are ignored.
 */
const buildRunScoreFilter = (
  filter: FilterState,
  outerPrefix: string,
): { sql: string; params: Record<string, unknown> } => {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  let i = 0;
  for (const f of filter) {
    if (f.type === "numberObject" && f.column === "agg_scores_avg") {
      if (!NUMERIC_SCORE_OPS.has(f.operator)) {
        throw new InvalidRequestError(
          `Invalid numeric score operator: ${f.operator}`,
        );
      }
      const k = `rsk${i}`;
      const v = `rsv${i}`;
      i += 1;
      params[k] = f.key;
      params[v] = f.value;
      clauses.push(
        `EXISTS (SELECT 1 FROM ${q("scores")} cs WHERE ` +
          `cs.${q("project_id")} = ${outerPrefix}.${q("project_id")} ` +
          `AND cs.${runTraceIdSubquery(outerPrefix)} ` +
          `AND cs.${q("name")} = :${k} AND cs.${q("data_type")} IN ('NUMERIC', 'BOOLEAN') ` +
          `AND cs.${q("is_deleted")} = false ` +
          `GROUP BY cs.${q("name")} HAVING avg(cs.${q("value")}) ${f.operator} :${v})`,
      );
    } else if (
      f.type === "categoryOptions" &&
      f.column === "agg_score_categories"
    ) {
      if (f.value.length === 0) {
        clauses.push(f.operator === "any of" ? "1 = 0" : "1 = 1");
        continue;
      }
      const k = `rsk${i}`;
      const placeholders = f.value.map((val, j) => {
        const name = `rscv${i}_${j}`;
        params[name] = val;
        return `:${name}`;
      });
      params[k] = f.key;
      i += 1;
      const negate = f.operator === "none of";
      clauses.push(
        `${negate ? "NOT EXISTS" : "EXISTS"} (SELECT 1 FROM ${q("scores")} cs WHERE ` +
          `cs.${q("project_id")} = ${outerPrefix}.${q("project_id")} ` +
          `AND cs.${runTraceIdSubquery(outerPrefix)} ` +
          `AND cs.${q("name")} = :${k} AND cs.${q("data_type")} = 'CATEGORICAL' ` +
          `AND cs.${q("string_value")} IN (${placeholders.join(", ")}) ` +
          `AND cs.${q("is_deleted")} = false)`,
      );
    }
  }
  return { sql: clauses.join(" AND "), params };
};

/** Default runs orderBy: createdAt DESC unless the user already orders by it, then the user order. */
const runsOrderBy = (orderBy?: OrderByState): string => {
  const order: OrderByState[] = [];
  if (orderBy?.column !== "createdAt") {
    order.push({ column: "createdAt", order: "DESC" });
  }
  if (orderBy) order.push(orderBy);
  return greptimeOrderBySql(order, datasetRunsTableGreptimeColumnDefinitions);
};

type RunScalarRow = {
  dataset_run_id: string;
  dataset_run_name: string;
  project_id: string;
  dataset_id: string;
  count_run_items: string | number;
  avg_latency_seconds: string | number | null;
  avg_total_cost: string | number | null;
  total_cost: string | number | null;
};

export const getDatasetRunsTableMetricsGreptime = async (
  opts: DatasetRunsMetricsTableQuery,
): Promise<DatasetRunsMetrics[]> => {
  const { projectId, datasetId, runIds, filter, orderBy, limit, offset } = opts;
  const scope = baseScope({ projectId, datasetId, runIds });

  // observation time window: ±1 day around the runs' creation span (app-computed, like CH's
  // min/max(dataset_run_created_at) ± INTERVAL 1 DAY scalar subqueries).
  const bounds = await greptimeQuery<{ lo: Date | null; hi: Date | null }>({
    query: `SELECT min(${q("dataset_run_created_at")}) AS lo, max(${q("dataset_run_created_at")}) AS hi
      FROM ${q("dataset_run_items")} WHERE ${scope.sql}`,
    params: scope.params,
    readOnly: true,
  });
  const lo = greptimeDate(bounds[0]?.lo);
  const hi = greptimeDate(bounds[0]?.hi);
  if (!lo || !hi) return [];
  const obsLo = greptimeTsParam(new Date(lo.getTime() - ONE_DAY_MS));
  const obsHi = greptimeTsParam(new Date(hi.getTime() + ONE_DAY_MS));

  const userScore = buildRunScoreFilter(filter, "drm");
  const dedup = dedupSubquery({
    columns: DRI_BASE_COLUMNS,
    whereSql: scope.sql,
  });

  const pagination =
    limit !== undefined && offset !== undefined
      ? "LIMIT :limit OFFSET :offset"
      : "";
  const paginationParams =
    limit !== undefined && offset !== undefined ? { limit, offset } : {};

  const rows = await greptimeQuery<RunScalarRow>({
    query: `
      WITH dataset_run_items_deduped AS (
        SELECT ${DRI_BASE_COLUMNS.map(q).join(", ")} FROM (${dedup}) r WHERE r.rn = 1
      ),
      observations_filtered AS (
        SELECT id, trace_id, project_id, start_time, end_time, total_cost
        FROM observations
        WHERE project_id = :projectId AND ${notDeleted()}
          AND start_time >= :obsLo AND start_time <= :obsHi
          AND trace_id IN (SELECT trace_id FROM dataset_run_items_deduped)
      ),
      trace_metrics AS (
        SELECT dri.trace_id, dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_item_id,
          CAST((to_unixtime(max(ofil.end_time)) - to_unixtime(min(ofil.start_time))) * 1000 AS BIGINT) AS latency_ms,
          sum(ofil.total_cost) AS total_cost
        FROM dataset_run_items_deduped dri
        JOIN observations_filtered ofil ON dri.trace_id = ofil.trace_id AND dri.project_id = ofil.project_id
        GROUP BY dri.trace_id, dri.project_id, dri.dataset_id, dri.dataset_run_id, dri.dataset_item_id
      ),
      dataset_run_metrics AS (
        SELECT
          dri.dataset_run_id AS dataset_run_id,
          dri.project_id AS project_id,
          dri.dataset_id AS dataset_id,
          dri.dataset_run_created_at AS dataset_run_created_at,
          dri.dataset_run_name AS dataset_run_name,
          count(DISTINCT dri.dataset_item_id) AS count_run_items,
          AVG(CASE WHEN dri.observation_id IS NULL THEN tm.latency_ms ELSE NULL END) / 1000.0 AS trace_avg_latency,
          AVG(CASE WHEN dri.observation_id IS NULL THEN tm.total_cost ELSE NULL END) AS trace_avg_cost,
          SUM(CASE WHEN dri.observation_id IS NULL THEN tm.total_cost ELSE NULL END) AS trace_total_cost,
          AVG(CASE WHEN dri.observation_id IS NOT NULL THEN (to_unixtime(ofil.end_time) - to_unixtime(ofil.start_time)) ELSE NULL END) AS obs_avg_latency,
          AVG(CASE WHEN dri.observation_id IS NOT NULL THEN tm.total_cost ELSE NULL END) AS obs_avg_cost,
          SUM(CASE WHEN dri.observation_id IS NOT NULL THEN tm.total_cost ELSE NULL END) AS obs_total_cost
        FROM dataset_run_items_deduped dri
        LEFT JOIN observations_filtered ofil ON dri.observation_id = ofil.id AND dri.project_id = ofil.project_id AND dri.trace_id = ofil.trace_id
        LEFT JOIN trace_metrics tm ON dri.trace_id = tm.trace_id AND dri.project_id = tm.project_id AND dri.dataset_id = tm.dataset_id AND dri.dataset_run_id = tm.dataset_run_id AND dri.dataset_item_id = tm.dataset_item_id
        GROUP BY dri.dataset_run_id, dri.project_id, dri.dataset_id, dri.dataset_run_created_at, dri.dataset_run_name
      )
      SELECT
        drm.dataset_run_id AS dataset_run_id,
        drm.dataset_run_name AS dataset_run_name,
        drm.project_id AS project_id,
        drm.dataset_id AS dataset_id,
        drm.count_run_items AS count_run_items,
        CASE WHEN drm.trace_avg_latency IS NOT NULL THEN drm.trace_avg_latency ELSE drm.obs_avg_latency END AS avg_latency_seconds,
        CASE WHEN drm.trace_avg_cost IS NOT NULL THEN drm.trace_avg_cost ELSE COALESCE(drm.obs_avg_cost, 0) END AS avg_total_cost,
        CASE WHEN drm.trace_total_cost IS NOT NULL THEN drm.trace_total_cost ELSE COALESCE(drm.obs_total_cost, 0) END AS total_cost
      FROM dataset_run_metrics drm
      WHERE 1 = 1 ${userScore.sql ? `AND ${userScore.sql}` : ""}
      ${runsOrderBy(orderBy)}
      ${pagination}`,
    params: {
      ...scope.params,
      obsLo,
      obsHi,
      ...userScore.params,
      ...paginationParams,
    },
    readOnly: true,
  });

  const scoresByRun = await fetchRunScores(
    projectId,
    datasetId,
    rows.map((r) => r.dataset_run_id),
  );

  return rows.map((r) => {
    const agg = scoresByRun.get(r.dataset_run_id);
    return {
      id: r.dataset_run_id,
      name: r.dataset_run_name,
      projectId: r.project_id,
      datasetId: r.dataset_id,
      countRunItems: Number(r.count_run_items),
      avgTotalCost: new Decimal(r.avg_total_cost ?? 0),
      totalCost: new Decimal(r.total_cost ?? 0),
      avgLatency: Number(r.avg_latency_seconds ?? 0),
      aggScoresAvg: agg?.scoresAvg ?? [],
      aggScoreCategories: agg?.scoreCategories ?? [],
    };
  });
};

/**
 * Per-run score aggregation, fetched separately for the page's runs (mirrors how the traces metrics
 * path fetches scores separately). Returns, per run, the list of `[name, avgValue]` (NUMERIC/BOOLEAN,
 * one entry per trace×name, matching CH's per-trace `groupArrayIf`) and `name:value` categorical
 * strings.
 */
const fetchRunScores = async (
  projectId: string,
  datasetId: string,
  runIds: string[],
): Promise<
  Map<string, { scoresAvg: Array<[string, number]>; scoreCategories: string[] }>
> => {
  const result = new Map<
    string,
    { scoresAvg: Array<[string, number]>; scoreCategories: string[] }
  >();
  if (runIds.length === 0) return result;
  const inClause = greptimeInClause("dataset_run_id", runIds, "frs");

  const rows = await greptimeQuery<{
    dataset_run_id: string;
    name: string;
    data_type: string;
    string_value: string | null;
    avg_value: string | number | null;
  }>({
    query: `
      SELECT d.dataset_run_id AS dataset_run_id, s.${q("name")} AS ${q("name")},
        s.${q("data_type")} AS ${q("data_type")}, s.${q("string_value")} AS ${q("string_value")},
        avg(s.${q("value")}) AS avg_value
      FROM (
        SELECT DISTINCT project_id, trace_id, dataset_run_id
        FROM ${q("dataset_run_items")}
        WHERE project_id = :projectId AND dataset_id = :datasetId AND ${inClause.sql} AND ${notDeleted()}
      ) d
      JOIN ${q("scores")} s ON s.${q("project_id")} = d.project_id AND s.${q("trace_id")} = d.trace_id AND s.${q("is_deleted")} = false
      GROUP BY d.dataset_run_id, d.trace_id, s.${q("name")}, s.${q("data_type")}, s.${q("string_value")}`,
    params: { projectId, datasetId, ...inClause.params },
    readOnly: true,
  });

  for (const row of rows) {
    const runId = row.dataset_run_id;
    const entry =
      result.get(runId) ??
      result.set(runId, { scoresAvg: [], scoreCategories: [] }).get(runId)!;
    if (row.data_type === "NUMERIC" || row.data_type === "BOOLEAN") {
      entry.scoresAvg.push([row.name, Number(row.avg_value ?? 0)]);
    } else if (row.data_type === "CATEGORICAL" && row.string_value) {
      entry.scoreCategories.push(`${row.name}:${row.string_value}`);
    }
  }
  return result;
};

export const getDatasetRunsTableRowsGreptime = async (
  opts: DatasetRunsMetricsTableQuery,
): Promise<DatasetRunsRows[]> => {
  const { projectId, datasetId, runIds, filter, orderBy, limit, offset } = opts;
  const scope = baseScope({ projectId, datasetId, runIds });
  const userScore = buildRunScoreFilter(filter, "drm");

  // Dedup to one row per run (latest by created_at) so run metadata is available.
  const cols = [
    "dataset_run_id",
    "project_id",
    "dataset_id",
    "dataset_run_name",
    "dataset_run_created_at",
    "dataset_run_description",
    "dataset_run_metadata",
    "created_at",
  ];
  const pagination =
    limit !== undefined && offset !== undefined
      ? "LIMIT :limit OFFSET :offset"
      : "";
  const paginationParams =
    limit !== undefined && offset !== undefined ? { limit, offset } : {};

  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      SELECT drm.dataset_run_id AS dataset_run_id, drm.project_id AS project_id, drm.dataset_id AS dataset_id,
        drm.dataset_run_name AS dataset_run_name, drm.dataset_run_created_at AS dataset_run_created_at,
        drm.dataset_run_description AS dataset_run_description,
        ${selectJsonColumn("dataset_run_metadata", { tablePrefix: "drm" })}
      FROM (
        SELECT ${cols.map(q).join(", ")}, ROW_NUMBER() OVER (
          PARTITION BY ${q("dataset_run_id")} ORDER BY ${q("created_at")} DESC) AS rrn
        FROM ${q("dataset_run_items")} WHERE ${scope.sql}
      ) drm
      WHERE drm.rrn = 1 ${userScore.sql ? `AND ${userScore.sql}` : ""}
      ${runsOrderBy(orderBy)}
      ${pagination}`,
    params: { ...scope.params, ...userScore.params, ...paginationParams },
    readOnly: true,
  });

  return rows.map((r) => ({
    id: requireGreptimeString(
      r.dataset_run_id,
      "dataset_run_items.dataset_run_id",
    ),
    name: requireGreptimeString(
      r.dataset_run_name,
      "dataset_run_items.dataset_run_name",
    ),
    projectId: requireGreptimeString(
      r.project_id,
      "dataset_run_items.project_id",
    ),
    createdAt: requireGreptimeDate(
      r.dataset_run_created_at,
      "dataset_run_items.dataset_run_created_at",
    ),
    datasetId: requireGreptimeString(
      r.dataset_id,
      "dataset_run_items.dataset_id",
    ),
    description: greptimeString(r.dataset_run_description) ?? "",
    metadata: greptimeString(r.dataset_run_metadata) ?? "",
  }));
};

export const getDatasetRunsTableCountGreptime = async (
  opts: DatasetRunsMetricsTableQuery,
): Promise<number> => {
  const { projectId, datasetId, runIds, filter } = opts;
  const scope = baseScope({ projectId, datasetId, runIds, prefix: "drm" });
  const userScore = buildRunScoreFilter(filter, "drm");

  const rows = await greptimeQuery<{ count: string | number }>({
    query: `
      SELECT count(DISTINCT drm.${q("dataset_run_id")}) AS count
      FROM ${q("dataset_run_items")} drm
      WHERE ${scope.sql} ${userScore.sql ? `AND ${userScore.sql}` : ""}`,
    params: { ...scope.params, ...userScore.params },
    readOnly: true,
  });
  return Number(rows[0]?.count ?? 0);
};
