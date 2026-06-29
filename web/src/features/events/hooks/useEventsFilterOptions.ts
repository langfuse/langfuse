import { api, type RouterInputs } from "@/src/utils/api";
import { useCallback, useMemo, useState } from "react";
import { type FilterState, type TimeFilter } from "@langfuse/shared";

type EventFilterOptionColumnsInput =
  RouterInputs["events"]["filterOptions"]["columns"];

// Element type of the tRPC `columns` arg — keeps the column lists below in sync
// with the server enum (a typo is a compile error via `satisfies`).
type EventFilterOptionColumn =
  NonNullable<EventFilterOptionColumnsInput>[number];

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
  "trace_scores_avg",
  "trace_score_categories",
] as const satisfies readonly EventFilterOptionColumn[];

// Columns loaded eagerly on mount in lazy mode: the sidebar's default-expanded
// facets (environment/name/type/isRootObservation) plus the search-bar empty-stage
// suggestion fields (level/type/environment/name). Everything else — high-cardinality
// userId/sessionId, model/prompt/experiment/tool facets, and the (3 separate CH
// queries) score columns — loads only when a facet is opened or typed into.
const EAGER_EVENT_FILTER_OPTION_COLUMNS = [
  "environment",
  "name",
  "type",
  "level",
  "isRootObservation",
] as const satisfies readonly EventFilterOptionColumn[];

const VALID_FILTER_OPTION_COLUMNS: ReadonlySet<string> = new Set(
  ALL_EVENT_FILTER_OPTION_COLUMNS,
);

const isEventFilterOptionColumn = (
  column: string,
): column is EventFilterOptionColumn => VALID_FILTER_OPTION_COLUMNS.has(column);

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
   * Lazy mode (v4 events table): start by requesting only the eagerly-visible
   * columns and grow the set on demand via the returned `requestColumns`. The
   * sidebar/search bar widen it when a facet is opened or typed into, so
   * high-cardinality facets never load until they are actually shown.
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

  // Lazy mode owns a monotonically-growing set of requested columns. It only
  // ever grows (a collapsed facet is not re-narrowed) so toggling a section open
  // and closed does not thrash the query, and previously-loaded options stay
  // cached.
  const [requestedColumns, setRequestedColumns] = useState<
    ReadonlySet<EventFilterOptionColumn>
  >(() => new Set(EAGER_EVENT_FILTER_OPTION_COLUMNS));

  const requestColumns = useCallback(
    (cols: readonly string[]) => {
      if (!lazy) return;
      setRequestedColumns((prev) => {
        let next: Set<EventFilterOptionColumn> | null = null;
        for (const col of cols) {
          if (isEventFilterOptionColumn(col) && !prev.has(col)) {
            next ??= new Set(prev);
            next.add(col);
          }
        }
        // Stable identity when nothing was added → no refetch.
        return next ?? prev;
      });
    },
    [lazy],
  );

  // In lazy mode, request exactly the columns asked for so far (sorted for a
  // stable query key). Otherwise honour an explicit `columns` subset, or request
  // everything (undefined → server defaults to all columns).
  const requestedColumnsArray = useMemo(
    () => Array.from(requestedColumns).sort(),
    [requestedColumns],
  );
  const effectiveColumns = lazy ? requestedColumnsArray : columns;

  // Fetch filter options
  const filterOptions = api.events.filterOptions.useQuery(
    {
      projectId,
      startTimeFilter:
        startTimeFilters.length > 0 ? startTimeFilters : undefined,
      isRootObservation,
      columns: effectiveColumns,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
      // Keep showing previous options while fetching new ones to avoid sidebar
      // flicker — and, in lazy mode, so already-loaded facets keep their values
      // while a newly-requested column streams in.
      placeholderData: (prev) => prev,
    },
  );

  // Transform filter options for sidebar
  const newFilterOptions = useMemo(() => {
    const scoreCategories =
      filterOptions.data?.score_categories?.reduce(
        (acc, score) => {
          acc[score.label] = score.values;
          return acc;
        },
        {} as Record<string, string[]>,
      ) ?? undefined;

    const scoresNumeric = filterOptions.data?.scores_avg ?? undefined;
    const traceScoreCategories =
      filterOptions.data?.trace_score_categories?.reduce(
        (acc, score) => {
          acc[score.label] = score.values;
          return acc;
        },
        {} as Record<string, string[]>,
      ) ?? undefined;
    const traceScoresNumeric =
      filterOptions.data?.trace_scores_avg ?? undefined;

    return {
      environment: filterOptions.data?.environment ?? undefined,
      name: filterOptions.data?.name ?? undefined,
      type: filterOptions.data?.type ?? undefined,
      level: filterOptions.data?.level ?? undefined,
      providedModelName: filterOptions.data?.providedModelName ?? undefined,
      modelId: filterOptions.data?.modelId ?? undefined,
      promptName: filterOptions.data?.promptName ?? undefined,
      traceTags: filterOptions.data?.traceTags ?? undefined,
      traceName: filterOptions.data?.traceName ?? undefined,
      userId: filterOptions.data?.userId ?? undefined,
      sessionId: filterOptions.data?.sessionId ?? undefined,
      version: filterOptions.data?.version ?? undefined,
      experimentDatasetId: filterOptions.data?.experimentDatasetId ?? undefined,
      experimentId: filterOptions.data?.experimentId ?? undefined,
      experimentName: filterOptions.data?.experimentName ?? undefined,
      isRootObservation: filterOptions.data?.isRootObservation ?? undefined,
      toolNames: filterOptions.data?.toolNames ?? undefined,
      calledToolNames: filterOptions.data?.calledToolNames ?? undefined,
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
      trace_score_categories: traceScoreCategories,
      trace_scores_avg: traceScoresNumeric,
    };
  }, [filterOptions.data]);

  // Lazy mode: the precise set of requested columns whose options have not yet
  // arrived (so the sidebar shows a skeleton for exactly those facets, and never
  // for never-enumerated facets like metadata). Empty once everything requested
  // so far has loaded — including after a background refetch, where placeholder
  // data keeps all columns present (no flicker).
  //
  // Gated on an in-flight fetch: a skeleton means "loading", not "no data". On a
  // terminal error `data` is undefined for every column, but we are NOT fetching
  // and will not auto-retry (staleTime: Infinity, refetchOnMount: false), so the
  // facets must render their empty state instead of skeletoning forever.
  const isFetching = filterOptions.isFetching;
  const loadingColumns = useMemo<ReadonlySet<string> | undefined>(() => {
    if (!lazy) return undefined;
    const pending = new Set<string>();
    if (!isFetching) return pending;
    for (const column of requestedColumns) {
      if ((newFilterOptions as Record<string, unknown>)[column] === undefined) {
        pending.add(column);
      }
    }
    return pending;
  }, [lazy, requestedColumns, newFilterOptions, isFetching]);

  return {
    filterOptions: newFilterOptions,
    isFilterOptionsPending: filterOptions.isPending,
    /** Terminal fetch error: consumers settle to the empty state (no skeleton /
     *  no perpetual loading row), since there is no auto-retry. */
    isFilterOptionsError: filterOptions.isError,
    /** Lazy mode only: columns requested but not yet loaded (per-facet skeletons). */
    loadingColumns,
    /** Lazy mode only: widen the requested column set (no-op otherwise). */
    requestColumns,
  };
}
