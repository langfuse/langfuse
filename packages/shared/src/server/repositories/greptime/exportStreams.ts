import { type FilterCondition } from "../../../types";
import { type TracingSearchType } from "../../../interfaces/search";
import { type TraceDomain, type Observation } from "../../../domain";
import { tracesTableCols } from "../../../tableDefinitions/tracesTable";
import { observationsTableCols } from "../../../observationsTable";
import { greptimeQuery } from "../../greptime/client";
import { DateTimeFilter, FilterList } from "../../greptime/sql/greptime-filter";
import { createGreptimeFilterFromFilterState } from "../../greptime/sql/factory";
import {
  tracesTableGreptimeColumnDefinitions,
  observationsTableGreptimeColumnDefinitions,
} from "../../greptime/sql/columnMappings";
import { greptimeSearchCondition } from "../../greptime/sql/search";
import { selectJsonColumn, greptimeJson } from "../../greptime/sql/rowContract";
import {
  convertGreptimeTraceRowToDomain,
  convertGreptimeObservationRowToDomain,
  greptimeTraceSelect,
  greptimeObservationSelect,
} from "./converters";
import { greptimeTsParam, notDeleted } from "./queryHelpers";

/**
 * GreptimeDB batch-export page readers (04-read-path.md, P5). The ClickHouse export streams joined a
 * `scores_agg` CTE and relied on `LIMIT 1 BY` dedup + a single streamed query; on the merged
 * projection that collapses to a keyset-paged scan (stable composite cursor, bounded memory) with no
 * dedup. Scores and comments are enriched per page by the worker (`getScoresFor*` + Postgres
 * comments), so these readers only page the base projection and yield whole pages — the page boundary
 * is what lets the worker batch the per-page enrichment.
 */

type CommonExportOpts = {
  projectId: string;
  filter: FilterCondition[] | null;
  cutoffCreatedAt: Date;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit: number;
  pageSize: number;
};

export type ExportObservationRow = Observation & {
  traceName: string | null;
  traceTags: string[];
  traceTimestamp: Date | null;
  userId: string | null;
  // Extra trace-denormalised columns used by the events export (BatchExportEventsRow).
  traceSessionId: string | null;
  traceRelease: string | null;
};

/** Lexicographic keyset predicate for a `(timeCol, id)` DESC scan (paged seek). */
const keysetDesc = (prefix: string, timeCol: string): string =>
  `(${prefix}.${timeCol} < :curTs OR (${prefix}.${timeCol} = :curTs AND ${prefix}.id < :curId))`;

/**
 * Page traces for export, newest first. Yields arrays (pages) of fully-rendered domain traces
 * (input/output/metadata included).
 */
export async function* streamTracesForExport(
  opts: CommonExportOpts,
): AsyncGenerator<TraceDomain[]> {
  const stateFilters = createGreptimeFilterFromFilterState(
    opts.filter ?? [],
    tracesTableGreptimeColumnDefinitions,
    tracesTableCols,
  );
  const filterList = new FilterList([
    ...stateFilters,
    new DateTimeFilter({
      table: "traces",
      field: "timestamp",
      operator: "<",
      value: opts.cutoffCreatedAt,
      tablePrefix: "t",
    }),
  ]);
  const applied = filterList.apply();
  const search = greptimeSearchCondition({
    query: opts.searchQuery,
    searchType: opts.searchType,
    tablePrefix: "t",
  });

  let cursor: { ts: string; id: string } | null = null;
  let emitted = 0;
  while (emitted < opts.rowLimit) {
    const pageSize = Math.min(opts.pageSize, opts.rowLimit - emitted);
    const rows: Record<string, unknown>[] = await greptimeQuery<
      Record<string, unknown>
    >({
      query: `
        SELECT ${greptimeTraceSelect({ prefix: "t" })}
        FROM traces t
        WHERE t.project_id = :projectId AND ${notDeleted("t")}
          ${applied.query ? `AND ${applied.query}` : ""}
          ${search.query}
          ${cursor ? `AND ${keysetDesc("t", "timestamp")}` : ""}
        ORDER BY t.timestamp DESC, t.id DESC
        LIMIT :pageSize`,
      params: {
        projectId: opts.projectId,
        pageSize,
        ...applied.params,
        ...search.params,
        ...(cursor ? { curTs: cursor.ts, curId: cursor.id } : {}),
      },
      readOnly: true,
    });
    if (rows.length === 0) return;
    yield rows.map((r) => convertGreptimeTraceRowToDomain(r));
    emitted += rows.length;
    const last = rows[rows.length - 1];
    cursor = {
      ts: greptimeTsParam(last.timestamp as Date),
      id: String(last.id),
    };
    if (rows.length < pageSize) return;
  }
}

/**
 * Page observations for export, newest first. Each row is a domain observation enriched with its
 * trace's name/tags/timestamp/userId (the columns the export flattener needs); model-pricing
 * enrichment stays in the worker.
 */
export async function* streamObservationsForExport(
  opts: CommonExportOpts,
): AsyncGenerator<ExportObservationRow[]> {
  const stateFilters = createGreptimeFilterFromFilterState(
    opts.filter ?? [],
    observationsTableGreptimeColumnDefinitions,
    observationsTableCols,
  );
  const filterList = new FilterList([
    ...stateFilters,
    new DateTimeFilter({
      table: "observations",
      field: "start_time",
      operator: "<",
      value: opts.cutoffCreatedAt,
      tablePrefix: "o",
    }),
  ]);
  const applied = filterList.apply();
  const search = greptimeSearchCondition({
    query: opts.searchQuery,
    searchType: opts.searchType,
    tablePrefix: "o",
  });
  const needsTraceJoin =
    (opts.filter ?? []).length > 0 || Boolean(applied.query);

  let cursor: { ts: string; id: string } | null = null;
  let emitted = 0;
  while (emitted < opts.rowLimit) {
    const pageSize = Math.min(opts.pageSize, opts.rowLimit - emitted);
    const rows: Record<string, unknown>[] = await greptimeQuery<
      Record<string, unknown>
    >({
      query: `
        SELECT ${greptimeObservationSelect({ prefix: "o" })},
          t.name AS \`traceName\`,
          ${selectJsonColumn("tags", { alias: "traceTags", tablePrefix: "t" })},
          t.timestamp AS \`traceTimestamp\`,
          t.user_id AS \`userId\`,
          t.session_id AS \`traceSessionId\`,
          t.release AS \`traceRelease\`
        FROM observations o
        LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id ${needsTraceJoin ? `AND ${notDeleted("t")}` : ""}
        WHERE o.project_id = :projectId AND ${notDeleted("o")}
          ${applied.query ? `AND ${applied.query}` : ""}
          ${search.query}
          ${cursor ? `AND ${keysetDesc("o", "start_time")}` : ""}
        ORDER BY o.start_time DESC, o.id DESC
        LIMIT :pageSize`,
      params: {
        projectId: opts.projectId,
        pageSize,
        ...applied.params,
        ...search.params,
        ...(cursor ? { curTs: cursor.ts, curId: cursor.id } : {}),
      },
      readOnly: true,
    });
    if (rows.length === 0) return;
    yield rows.map((r) => ({
      ...convertGreptimeObservationRowToDomain(r),
      traceName: (r.traceName as string | null) ?? null,
      traceTags: greptimeJson<string[]>(r.traceTags, []),
      traceTimestamp: (r.traceTimestamp as Date | null) ?? null,
      userId: (r.userId as string | null) ?? null,
      traceSessionId: (r.traceSessionId as string | null) ?? null,
      traceRelease: (r.traceRelease as string | null) ?? null,
    }));
    emitted += rows.length;
    const last = rows[rows.length - 1];
    cursor = {
      ts: greptimeTsParam(last.start_time as Date),
      id: String(last.id),
    };
    if (rows.length < pageSize) return;
  }
}
