import {
  eventsTableCols,
  type FilterState,
  type TimeFilter,
} from "@langfuse/shared";

// Pure query planning for the events filter options (LFE-14489): which facet
// columns share one bulk query, which need a self-excluded per-column query,
// and the refining filter each carries. useEventsFilterOptions executes the plan.

// Score-catalog columns (score names, not per-value counts) always stay in the
// bulk: the server never refines them, and the search-bar grammar's score-type
// routing + AI score-name validation must see the full catalog (LFE-10596).
const UNREFINED_SCORE_CATALOG_COLUMNS: ReadonlySet<string> = new Set([
  "scores_avg",
  "score_categories",
  "score_booleans",
  "trace_scores_avg",
  "trace_score_categories",
  "trace_score_booleans",
]);

// Filters can be keyed by column id ("environment") or display name ("User ID",
// as the embed-scope filters are). Facet columns are always ids — a label that
// slipped past self-exclusion would self-collapse its facet.
const FACET_COLUMN_ID_BY_NAME_OR_ID: ReadonlyMap<string, string> = new Map(
  eventsTableCols.flatMap((c) => [
    [c.id, c.id],
    [c.name, c.id],
  ]),
);

export const resolveEventFacetColumnId = (column: string): string =>
  FACET_COLUMN_ID_BY_NAME_OR_ID.get(column) ?? column;

const isStartTimeCondition = (f: FilterState[number]): f is TimeFilter =>
  f.type === "datetime" &&
  (f.column === "startTime" || f.column === "Start Time");

/**
 * Split user-authored start-time conditions (e.g. a search-bar `startTime:>…`)
 * from the refining rest. They must travel via the authoritative
 * `startTimeFilter` channel — the server drops start-time entries from the
 * participating filter, so leaving them here would silently un-scope the counts.
 * Non-participating columns (input/output/comment*, positionInTrace) pass
 * through verbatim; the server omits all counts while one is active.
 */
export const splitFacetFilter = (
  filter: FilterState,
): { startTimeFilter: TimeFilter[]; refiningFilter: FilterState } => ({
  startTimeFilter: filter.filter(isStartTimeCondition),
  refiningFilter: filter.filter((f) => !isStartTimeCondition(f)),
});

export type FacetQueryPlan<Column extends string = string> = {
  /** Shared bulk query: clean facets + score catalog, refined by the full
   *  filter. `columns` undefined = request-all (only valid unfiltered). */
  bulk: {
    columns: Column[] | undefined;
    filter: FilterState | undefined;
  };
  /** One query per self-excluded facet — its own condition removed, so its full
   *  option list survives and the `none of` complement stays computable — plus
   *  each lazily-requested column. */
  perColumn: { column: Column; filter: FilterState | undefined }[];
};

/**
 * Partition the requested columns into the bulk and per-column queries, with
 * each query's refining filter. `refiningFilter` must be start-time-free (see
 * `splitFacetFilter`); lazy columns are always per-column (own cache entry each).
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

  // Only facets carrying their own condition would self-collapse in the bulk;
  // a score condition never evicts its (unrefined) catalog column.
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
