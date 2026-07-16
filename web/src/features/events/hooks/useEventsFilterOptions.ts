import { api, type RouterInputs, type RouterOutputs } from "@/src/utils/api";
import { useCallback, useMemo, useState } from "react";
import { type FilterState, type TimeFilter } from "@langfuse/shared";

type EventFilterOptionColumnsInput =
  RouterInputs["events"]["filterOptions"]["columns"];

// Element type of the tRPC `columns` arg — keeps the column lists below in sync
// with the server enum (a typo is a compile error via `satisfies`).
type EventFilterOptionColumn =
  NonNullable<EventFilterOptionColumnsInput>[number];

// The filterOptions payload, keyed by column. Every key is optional: the server
// returns only the columns that were requested (see eventsService.ts), which is
// what lets lazy loading tell "loaded, no values" ([]) from "not requested yet"
// (key absent).
type FilterOptionsData = RouterOutputs["events"]["filterOptions"];

// Every server-enumerable filter-options column. Used to (a) request all options
// in non-lazy mode and (b) filter caller-supplied columns down to ones the
// endpoint actually understands (the sidebar/search bar pass raw facet/field ids,
// some of which — metadata, latency, id — have no server-side option list).
const ALL_EVENT_FILTER_OPTION_COLUMNS = [
  "providedModelName",
  "modelId",
  "name",
  "promptName",
  "traceTags",
  "traceName",
  "type",
  "userId",
  "version",
  "sessionId",
  "level",
  "environment",
  "experimentDatasetId",
  "experimentId",
  "experimentName",
  "isRootObservation",
  "toolNames",
  "calledToolNames",
  "scores_avg",
  "score_categories",
  "score_booleans",
  "trace_scores_avg",
  "trace_score_categories",
  "trace_score_booleans",
] as const satisfies readonly EventFilterOptionColumn[];

// Columns loaded eagerly on mount in lazy mode: the sidebar's default-expanded
// facets (environment/name/type/isRootObservation) plus the search-bar empty-stage
// suggestion fields (level/type/environment/name). The high-cardinality facets
// (userId/sessionId, model/prompt/experiment/tool) load only when opened or typed.
//
// The six score-NAME columns are eager too. They are cheap (just the distinct
// score names + their categorical buckets, not per-row data) and drive the
// grammar's score-type routing: `scoreTypeContextFromObserved` must be populated
// before the bar lowers a `scores.<name>:5` token, or a categorical numeric-label
// score (e.g. a 1–5 rating) mis-routes to `scores_avg` and silently empties the
// table. Keeping them eager restores that pre-lazy invariant.
const EAGER_EVENT_FILTER_OPTION_COLUMNS = [
  "environment",
  "name",
  "type",
  "level",
  "isRootObservation",
  "scores_avg",
  "score_categories",
  "score_booleans",
  "trace_scores_avg",
  "trace_score_categories",
  "trace_score_booleans",
] as const satisfies readonly EventFilterOptionColumn[];

const EAGER_COLUMN_SET: ReadonlySet<string> = new Set(
  EAGER_EVENT_FILTER_OPTION_COLUMNS,
);
const VALID_FILTER_OPTION_COLUMNS: ReadonlySet<string> = new Set(
  ALL_EVENT_FILTER_OPTION_COLUMNS,
);

const isEventFilterOptionColumn = (
  column: string,
): column is EventFilterOptionColumn => VALID_FILTER_OPTION_COLUMNS.has(column);

// Shared react-query options: filter options change slowly and are never live —
// fetch once and keep (no refetch on mount/focus/reconnect, infinite stale time),
// and keep prior values on screen while a key changes (time-range move) so the
// sidebar/bar never flicker.
const FILTER_OPTION_QUERY_OPTIONS = {
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: Infinity,
  placeholderData: <T>(prev: T) => prev,
} as const;

type LazyFilterOptionResult = {
  data: FilterOptionsData | undefined;
  isFetching: boolean;
  isError: boolean;
};

type UseEventsFilterOptionsParams = {
  projectId: string;
  oldFilterState: FilterState;
  isRootObservation?: boolean;
  /**
   * Explicit column subset to request (non-lazy). Ignored when `lazy` is set.
   * Omit to request every column (the default bulk behavior).
   */
  columns?: EventFilterOptionColumnsInput;
  /**
   * Lazy mode (v4 events table): request only the eagerly-visible columns up
   * front and load every other facet on demand via the returned `requestColumns`.
   * Each on-demand facet is its OWN cached query, so opening a new facet fetches
   * only that column — already-loaded facets are served from cache and never
   * re-fetched. The sidebar/search bar widen the set when a facet is opened or
   * typed into.
   */
  lazy?: boolean;
};

export function useEventsFilterOptions({
  projectId,
  oldFilterState,
  isRootObservation,
  columns,
  lazy = false,
}: UseEventsFilterOptionsParams) {
  // Extract start time filters for filter options query
  const startTimeFilters = useMemo(() => {
    return oldFilterState.filter(
      (f) =>
        (f.column === "Start Time" || f.column === "startTime") &&
        f.type === "datetime",
    ) as TimeFilter[];
  }, [oldFilterState]);

  const baseInput = useMemo(
    () => ({
      projectId,
      startTimeFilter:
        startTimeFilters.length > 0 ? startTimeFilters : undefined,
      isRootObservation,
    }),
    [projectId, startTimeFilters, isRootObservation],
  );

  // Lazy mode owns a monotonically-growing set of on-demand columns (everything
  // beyond the eager set). It only grows — re-collapsing a facet does not narrow
  // it — and each column gets its own cached query, so toggling sections open and
  // closed never re-fetches.
  const [lazyColumnSet, setLazyColumnSet] = useState<
    ReadonlySet<EventFilterOptionColumn>
  >(() => new Set());

  const requestColumns = useCallback(
    (cols: readonly string[]) => {
      if (!lazy) return;
      setLazyColumnSet((prev) => {
        let next: Set<EventFilterOptionColumn> | null = null;
        for (const col of cols) {
          if (
            isEventFilterOptionColumn(col) &&
            !EAGER_COLUMN_SET.has(col) &&
            !prev.has(col)
          ) {
            next ??= new Set(prev);
            next.add(col);
          }
        }
        // Stable identity when nothing was added → no new query.
        return next ?? prev;
      });
    },
    [lazy],
  );

  const lazyColumns = useMemo(
    () => Array.from(lazyColumnSet).sort(),
    [lazyColumnSet],
  );

  // Eager bulk query: one ClickHouse scan for the always-visible columns (lazy
  // mode) — or the explicit/all columns in non-lazy mode (unchanged behavior).
  const eagerColumns = lazy ? [...EAGER_EVENT_FILTER_OPTION_COLUMNS] : columns;
  const eagerQuery = api.events.filterOptions.useQuery(
    { ...baseInput, columns: eagerColumns },
    {
      trpc: { context: { skipBatch: true } },
      ...FILTER_OPTION_QUERY_OPTIONS,
    },
  );

  // One independently-cached query per on-demand column. `combine` merges them
  // into a single payload + derives which columns are still loading / errored,
  // and react-query memoizes the result so identity is stable between changes.
  const combineLazy = useCallback(
    (results: readonly LazyFilterOptionResult[]) => {
      const data: FilterOptionsData = {};
      const pendingColumns: string[] = [];
      const erroredColumns: string[] = [];
      results.forEach((r, i) => {
        const column = lazyColumns[i];
        if (column === undefined) return;
        // Publish data first: a post-success refetch error keeps placeholderData,
        // so an already-loaded facet retains its values instead of blanking out —
        // symmetric with the (combine-free) eager query.
        if (r.data) {
          Object.assign(data, r.data);
          return;
        }
        // No data: a terminal error settles this column to empty; an in-flight
        // fetch is loading. Tracked PER COLUMN so one facet's error (e.g. a
        // userId approx_top_k timeout) never blocks loading the others.
        if (r.isError) {
          erroredColumns.push(column);
        } else if (r.isFetching) {
          pendingColumns.push(column);
        }
      });
      return { data, pendingColumns, erroredColumns };
    },
    [lazyColumns],
  );

  const lazyResult = api.useQueries(
    (t) =>
      lazyColumns.map((column) =>
        t.events.filterOptions(
          { ...baseInput, columns: [column] },
          FILTER_OPTION_QUERY_OPTIONS,
        ),
      ),
    { combine: combineLazy },
  );

  // Merge the eager payload with every loaded on-demand column.
  const rawData = useMemo<FilterOptionsData>(
    () => ({ ...eagerQuery.data, ...lazyResult.data }),
    [eagerQuery.data, lazyResult.data],
  );

  // Transform filter options for sidebar
  const newFilterOptions = useMemo(() => {
    const scoreCategories =
      rawData.score_categories?.reduce(
        (acc, score) => {
          acc[score.label] = score.values;
          return acc;
        },
        {} as Record<string, string[]>,
      ) ?? undefined;

    const scoresNumeric = rawData.scores_avg ?? undefined;
    const traceScoreCategories =
      rawData.trace_score_categories?.reduce(
        (acc, score) => {
          acc[score.label] = score.values;
          return acc;
        },
        {} as Record<string, string[]>,
      ) ?? undefined;
    const traceScoresNumeric = rawData.trace_scores_avg ?? undefined;

    return {
      environment: rawData.environment ?? undefined,
      name: rawData.name ?? undefined,
      type: rawData.type ?? undefined,
      level: rawData.level ?? undefined,
      providedModelName: rawData.providedModelName ?? undefined,
      modelId: rawData.modelId ?? undefined,
      promptName: rawData.promptName ?? undefined,
      traceTags: rawData.traceTags ?? undefined,
      traceName: rawData.traceName ?? undefined,
      userId: rawData.userId ?? undefined,
      sessionId: rawData.sessionId ?? undefined,
      version: rawData.version ?? undefined,
      experimentDatasetId: rawData.experimentDatasetId ?? undefined,
      experimentId: rawData.experimentId ?? undefined,
      experimentName: rawData.experimentName ?? undefined,
      isRootObservation: rawData.isRootObservation ?? undefined,
      toolNames: rawData.toolNames ?? undefined,
      calledToolNames: rawData.calledToolNames ?? undefined,
      toolDefinitions: [],
      toolCalls: [],
      latency: [],
      timeToFirstToken: [],
      tokensPerSecond: [],
      inputTokens: [],
      outputTokens: [],
      totalTokens: [],
      inputCost: [],
      outputCost: [],
      totalCost: [],
      score_categories: scoreCategories,
      scores_avg: scoresNumeric,
      score_booleans: rawData.score_booleans ?? undefined,
      trace_score_categories: traceScoreCategories,
      trace_scores_avg: traceScoresNumeric,
      trace_score_booleans: rawData.trace_score_booleans ?? undefined,
    };
  }, [rawData]);

  // Lazy mode: the precise set of requested columns whose options have not yet
  // arrived (so the sidebar shows a skeleton for exactly those facets, and never
  // for never-enumerated facets like metadata).
  //
  // Each entry is gated on an in-flight fetch: a skeleton means "loading", not
  // "no data". On a terminal error the column is dropped (no auto-retry, so the
  // facet renders its empty state instead of skeletoning forever).
  const isEagerFetching = eagerQuery.isFetching;
  const loadingColumns = useMemo<ReadonlySet<string> | undefined>(() => {
    if (!lazy) return undefined;
    const pending = new Set<string>(lazyResult.pendingColumns);
    if (isEagerFetching) {
      const data = rawData as Record<string, unknown>;
      for (const column of EAGER_EVENT_FILTER_OPTION_COLUMNS) {
        if (data[column] === undefined) pending.add(column);
      }
    }
    return pending;
  }, [lazy, lazyResult.pendingColumns, isEagerFetching, rawData]);

  // Columns whose fetch terminally errored, per column. Consumers settle these to
  // the empty state (no skeleton, no perpetual loading row — there is no
  // auto-retry) WITHOUT blocking any other column's on-demand load. The eager
  // bulk is read directly (no combine); if it fails, its columns — which are
  // never lazily re-requestable — settle too.
  const lazyErroredColumns = lazyResult.erroredColumns;
  const isEagerError = eagerQuery.isError;
  const erroredColumns = useMemo<ReadonlySet<string>>(() => {
    const errored = new Set<string>(lazyErroredColumns);
    if (isEagerError) {
      for (const column of EAGER_EVENT_FILTER_OPTION_COLUMNS)
        errored.add(column);
    }
    return errored;
  }, [lazyErroredColumns, isEagerError]);

  return {
    filterOptions: newFilterOptions,
    isFilterOptionsPending: eagerQuery.isPending,
    /** Columns whose fetch terminally errored (per column). Consumers settle these
     *  to the empty state; other columns keep loading normally. */
    erroredColumns,
    /** Lazy mode only: columns requested but not yet loaded (per-facet skeletons). */
    loadingColumns,
    /** Lazy mode only: widen the requested column set (no-op otherwise). */
    requestColumns,
  };
}
