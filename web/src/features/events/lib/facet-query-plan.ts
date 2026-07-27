import { eventsTableCols, type FilterState } from "@langfuse/shared";

// Pure planning for the events filter-options queries (LFE-14489): given the
// active filter set, decide which facet columns can share one bulk query and
// which need their own self-excluded query, and what refining filter each
// query carries. Keeping this a pure module (no hooks, no react-query) makes
// the refinement semantics directly testable; useEventsFilterOptions merely
// executes the returned plan.

// Score-catalog columns list score NAMES/categories/buckets, not per-value
// counts. The server discovers them from the trace-score scope (time-bounded
// only) and NEVER applies the refining filter to them, so they never refine and
// never self-collapse. Keeping the full catalog also protects the search-bar
// grammar: its score-type routing and its AI score-name validation read this
// list, so a name filtered out of the active set must still be recognized as a
// real score (LFE-10596). They therefore always stay in the shared bulk query
// and are never treated as self-filtered.
const UNREFINED_SCORE_CATALOG_COLUMNS: ReadonlySet<string> = new Set([
  "scores_avg",
  "score_categories",
  "score_booleans",
  "trace_scores_avg",
  "trace_score_categories",
  "trace_score_booleans",
]);

// Filter conditions can be keyed by the column id ("environment") or its
// display name ("Environment") — URL state is normalized to ids by
// decodeAndNormalizeFilters, but embed-scope filters (e.g. the user page's
// `User ID` condition) and legacy callers still use display names. Facet and
// option columns are always ids, so normalize before matching a filter to a
// facet — a label-keyed filter that slips past self-exclusion self-collapses
// its facet.
const FACET_COLUMN_ID_BY_NAME_OR_ID: ReadonlyMap<string, string> = new Map(
  eventsTableCols.flatMap((c) => [
    [c.id, c.id],
    [c.name, c.id],
  ]),
);

export const resolveEventFacetColumnId = (column: string): string =>
  FACET_COLUMN_ID_BY_NAME_OR_ID.get(column) ?? column;

/**
 * Drop start-time conditions from a refining filter. The dedicated
 * `startTimeFilter` input stays authoritative for the bounded facet scan and
 * its score lookback; everything else refines the counts. The server drops the
 * non-participating columns (input/output/comment*, positionInTrace) and omits
 * counts while one of them is active — those are forwarded verbatim.
 */
export const toRefiningFilter = (filter: FilterState): FilterState =>
  filter.filter(
    (f) =>
      !(
        f.type === "datetime" &&
        (f.column === "startTime" || f.column === "Start Time")
      ),
  );

export type FacetQueryPlan<Column extends string = string> = {
  /**
   * The shared bulk query: clean value facets + the score catalog, refined by
   * the FULL filter (the server ignores it for the catalog). `columns` is
   * undefined for the "request all" mode (no self-exclusion possible there —
   * only valid with an empty refining filter).
   */
  bulk: {
    columns: Column[] | undefined;
    filter: FilterState | undefined;
  };
  /**
   * One query per facet that must not see part of the filter: every requested
   * value facet with its own active condition (self-exclusion — a facet's
   * options/counts must reflect every OTHER filter so its full option list
   * stays visible and the `none of` complement stays computable), plus any
   * lazily-requested on-demand column. `filter` is undefined when nothing
   * refines that column.
   */
  perColumn: { column: Column; filter: FilterState | undefined }[];
};

/**
 * Partition the requested facet columns into the shared bulk query and
 * self-excluded per-column queries, attaching each query's refining filter.
 *
 * `refiningFilter` must already be start-time-free (see `toRefiningFilter`).
 * `lazyColumns` are always per-column (they load on demand and each keeps its
 * own react-query cache entry); they self-exclude like any other facet.
 */
export function planEventFacetQueries<Column extends string>(params: {
  refiningFilter: FilterState;
  eagerColumns: readonly Column[] | undefined;
  lazyColumns: readonly Column[];
}): FacetQueryPlan<Column> {
  const { refiningFilter, eagerColumns, lazyColumns } = params;

  const filterFor = (column: Column): FilterState | undefined => {
    const refined = refiningFilter.filter(
      (f) => resolveEventFacetColumnId(f.column) !== column,
    );
    return refined.length > 0 ? refined : undefined;
  };

  // Value columns carrying their OWN active condition. Only these would
  // self-collapse under the shared bulk filter; the score catalog never
  // refines, so a score condition does not evict its column from the bulk.
  const selfFilteredColumns = new Set(
    refiningFilter
      .map((f) => resolveEventFacetColumnId(f.column))
      .filter((c) => !UNREFINED_SCORE_CATALOG_COLUMNS.has(c)),
  );

  const bulkColumns = eagerColumns?.filter((c) => !selfFilteredColumns.has(c));
  const dirtyEagerColumns =
    eagerColumns?.filter((c) => selfFilteredColumns.has(c)) ?? [];

  const perColumn = Array.from(
    new Set<Column>([...lazyColumns, ...dirtyEagerColumns]),
  )
    .sort()
    .map((column) => ({ column, filter: filterFor(column) }));

  return {
    bulk: {
      columns: bulkColumns,
      filter: refiningFilter.length > 0 ? refiningFilter : undefined,
    },
    perColumn,
  };
}
