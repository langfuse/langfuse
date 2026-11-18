import { api, sendAsPostOption } from "@/src/utils/api";
import { useEffect, useMemo, useState } from "react";
import {
  type FilterState,
  AnnotationQueueObjectType,
  type TracingSearchType,
  type ScoreAggregate,
} from "@langfuse/shared";
import { type FullEventsObservations } from "@langfuse/shared/src/server";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { usePendingRowIds } from "@/src/components/table/hooks/usePendingRowIds";
import {
  tablePlaceholderOptions,
  type TableDataScope,
} from "@/src/components/table/utils/tablePlaceholder";
import { type EventBatchIOOutput } from "@/src/features/events/server/eventsRouter";
import {
  removeAppRootDefaultFilter,
  shouldRunAppRootFallbackQuery,
} from "@/src/features/events/lib/appRootDefaultFilterPolicy";

type FullEventsObservation = FullEventsObservations[number] & {
  scores?: ScoreAggregate;
  traceScores?: ScoreAggregate;
};

type UseEventsTableDataParams = {
  projectId: string;
  filterState: FilterState;
  tableDataScope: TableDataScope;
  paginationState: {
    page: number;
    limit: number;
  };
  orderByState: {
    column: string;
    order: "ASC" | "DESC";
  } | null;
  searchQuery?: string | null;
  searchType?: TracingSearchType[];
  selectedRows: Record<string, boolean>;
  selectAll: boolean;
  setSelectedRows: (rows: Record<string, boolean>) => void;
  appRootFallbackEnabled?: boolean;
  /**
   * Gate the row + batched-I/O queries. Defaults to true; the events table
   * passes `false` in chart mode so the (hidden) table's expensive row/IO
   * fetches don't run alongside the chart's aggregate query.
   */
  rowsEnabled?: boolean;
  /**
   * The resolved date range the table queries, before any pagination pinning.
   * A change (for example a relative range re-anchoring) re-arms the auxiliary
   * gate, because the auxiliary query keys change with it.
   */
  auxiliaryDateRange?: { from?: Date; to?: Date } | null;
  /**
   * Chars of I/O to fetch per cell. Undefined keeps the cheap pre-truncated
   * read, which holds too little text to fill a taller row (LFE-14586).
   */
  ioCharLimit?: number;
};

/**
 * useHasPaintedScope reports whether the browser has painted at least once
 * since `scope` became current. A `null` scope is never painted.
 */
function useHasPaintedScope(scope: string | null) {
  const [paintedScope, setPaintedScope] = useState<string | null>(null);

  useEffect(() => {
    if (scope === null) return;
    let afterPaintFrame: number | undefined;
    // The first frame callback runs before the paint; the second runs after it.
    const beforePaintFrame = requestAnimationFrame(() => {
      afterPaintFrame = requestAnimationFrame(() => setPaintedScope(scope));
    });
    return () => {
      cancelAnimationFrame(beforePaintFrame);
      if (afterPaintFrame !== undefined) cancelAnimationFrame(afterPaintFrame);
      setPaintedScope(null);
    };
  }, [scope]);

  return scope !== null && paintedScope === scope;
}

export function useEventsTableData({
  projectId,
  filterState,
  tableDataScope,
  paginationState,
  orderByState,
  searchQuery,
  searchType,
  selectedRows,
  selectAll,
  setSelectedRows,
  appRootFallbackEnabled = false,
  rowsEnabled = true,
  auxiliaryDateRange,
  ioCharLimit,
}: UseEventsTableDataParams) {
  const capture = usePostHogClientCapture();
  // Prepare query payloads
  const getCountPayload = useMemo(
    () => ({
      projectId,
      filter: filterState,
      searchQuery: searchQuery ?? null,
      searchType: searchType ?? ["id", "content"],
      orderBy: null,
    }),
    [projectId, filterState, searchQuery, searchType],
  );

  const getAllPayload = useMemo(
    () => ({
      ...getCountPayload,
      page: paginationState.page,
      limit: paginationState.limit,
      orderBy: orderByState,
    }),
    [
      getCountPayload,
      paginationState.page,
      paginationState.limit,
      orderByState,
    ],
  );

  const silentHttpCodes = [422];
  const placeholderOptions = tablePlaceholderOptions(tableDataScope);

  const observations = api.events.all.useQuery(getAllPayload, {
    ...placeholderOptions,
    enabled: rowsEnabled,
    refetchOnWindowFocus: true,
    meta: {
      ...placeholderOptions.meta,
      silentHttpCodes, // Turns off red bubble
    },
  });

  const fallbackPayload = useMemo(
    () => ({
      ...getAllPayload,
      filter: removeAppRootDefaultFilter(getAllPayload.filter),
    }),
    [getAllPayload],
  );
  const shouldRunAppRootFallback = shouldRunAppRootFallbackQuery({
    enabled: appRootFallbackEnabled,
    filters: getAllPayload.filter,
    page: paginationState.page,
    rootQuerySucceeded: observations.isSuccess,
    rootQueryIsPlaceholder: observations.isPlaceholderData,
    rootRowCount: observations.data?.observations.length ?? 0,
  });
  const appRootFallbackQuery = api.events.all.useQuery(fallbackPayload, {
    // Also gate on rowsEnabled (matches the primary + I/O queries): otherwise a
    // stale-cached fallback condition could fire a real row fetch in chart mode.
    enabled: rowsEnabled && shouldRunAppRootFallback,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    retry: false,
    meta: {
      tableDataScope: {
        ...tableDataScope,
        filter: removeAppRootDefaultFilter(tableDataScope.filter),
      },
      silentHttpCodes,
    },
  });
  const isAppRootFallbackActive =
    shouldRunAppRootFallback && !appRootFallbackQuery.isError;
  const activeObservations = isAppRootFallbackActive
    ? appRootFallbackQuery
    : observations;
  const rowQueryScope = JSON.stringify(
    isAppRootFallbackActive ? fallbackPayload : getAllPayload,
  );
  // A terminal row error also settles the rows, so a failed row query never
  // leaves the independent auxiliary queries blocked.
  const areRowsSettled =
    rowsEnabled &&
    !activeObservations.isPlaceholderData &&
    (activeObservations.isSuccess || activeObservations.isError);
  const haveRowsPainted = useHasPaintedScope(
    areRowsSettled ? rowQueryScope : null,
  );
  const haveRowsLoaded = areRowsSettled && haveRowsPainted;
  // The auxiliary data (facets, exact count, outlier strip) is defined by the
  // filters, search, time range and project, never by page, page size or sort.
  const auxiliaryScope = JSON.stringify([
    tableDataScope,
    auxiliaryDateRange ?? null,
  ]);
  // A refetch of the rows already on screen (such as a refresh) holds back
  // auxiliary fetches that would start during it. Focus and reconnect refetch
  // the rows first; auxiliary queries resume when this gate opens. A page or sort change is
  // navigation, including a stale refetch behind cached rows of a revisited
  // page: it never counts, from the moment the row query key changes until
  // the fetches it started settle.
  const rowsFetching =
    observations.isFetching || appRootFallbackQuery.isFetching;
  const [trackedRowScope, setTrackedRowScope] = useState(rowQueryScope);
  const [isNavigationFetching, setIsNavigationFetching] = useState(false);
  const hasRowScopeChanged = trackedRowScope !== rowQueryScope;
  if (hasRowScopeChanged) {
    setTrackedRowScope(rowQueryScope);
    setIsNavigationFetching(rowsFetching);
  } else if (isNavigationFetching && !rowsFetching) {
    setIsNavigationFetching(false);
  }
  const isRowNavigation = hasRowScopeChanged || isNavigationFetching;
  const isRowRefetching =
    !isRowNavigation &&
    [observations, appRootFallbackQuery].some(
      (query) =>
        query.isFetching && query.isSuccess && !query.isPlaceholderData,
    );
  const [openedAuxiliaryScope, setOpenedAuxiliaryScope] = useState<
    string | null
  >(null);
  // The gate opens once the rows of the current auxiliary scope loaded,
  // painted and stopped fetching, so cached rows of a revisited filter wait for
  // their refetch. It stays open while the user pages or sorts. Only the
  // current scope is remembered: a new filter, search, time range or project
  // re-arms it, including a return to an earlier one.
  const isAuxiliaryScopeOpen =
    openedAuxiliaryScope === auxiliaryScope ||
    (haveRowsLoaded && !rowsFetching);
  const nextOpenedAuxiliaryScope = isAuxiliaryScopeOpen ? auxiliaryScope : null;
  if (openedAuxiliaryScope !== nextOpenedAuxiliaryScope) {
    setOpenedAuxiliaryScope(nextOpenedAuxiliaryScope);
  }
  // Without row queries (chart mode) nothing competes. Auxiliary data that
  // already loaded stays in place while the gate is closed.
  const canLoadAuxiliaryData =
    !rowsEnabled || (isAuxiliaryScopeOpen && !isRowRefetching);
  const usedAppRootFallback =
    shouldRunAppRootFallback &&
    appRootFallbackQuery.isSuccess &&
    appRootFallbackQuery.data.observations.length > 0;

  // Built from the rows on screen, placeholder or not: while the row query is
  // showing the previous page the payload — and therefore the I/O query key —
  // is the previous one too, so the cells keep the I/O they already have.
  const batchIOPayload = useMemo(() => {
    const validObservations =
      activeObservations.data?.observations?.filter(
        (o) => o.id && o.traceId && o.startTime,
      ) ?? [];

    if (validObservations.length === 0) {
      return null;
    }

    const startTimes = validObservations
      .map((o) => o.startTime?.getTime() ?? 0)
      .filter((t) => t > 0);

    const minStartTime = new Date(Math.min(...startTimes));
    const maxStartTime = new Date(Math.max(...startTimes));

    return {
      projectId,
      observations: validObservations.map((o) => ({
        id: o.id,
        traceId: o.traceId!,
      })),
      minStartTime,
      maxStartTime,
      // events_core's pre-truncated I/O can't fill a taller row, so ask for a
      // bounded slice of the full I/O instead.
      ...(ioCharLimit !== undefined
        ? { truncated: false as const, ioCharLimit }
        : {}),
    };
  }, [activeObservations.data?.observations, projectId, ioCharLimit]);

  // Fetch I/O data
  const ioDataQuery = api.events.batchIO.useQuery(batchIOPayload!, {
    ...sendAsPostOption,
    ...placeholderOptions,
    enabled:
      rowsEnabled && activeObservations.isSuccess && batchIOPayload !== null,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  // I/O lands one query behind the rows.
  const isIoPending = usePendingRowIds(ioDataQuery);

  // Extract error information for display (only from observations.all, not batchIO)
  const error = activeObservations.error;

  const errorHttpStatus = activeObservations.error?.data?.httpStatus;

  const isSilencedError =
    activeObservations.isError &&
    errorHttpStatus &&
    silentHttpCodes.includes(errorHttpStatus);

  // Memoize joined data to prevent infinite re-renders
  // Handle loading, error, and success states
  const joinedData = useMemo(() => {
    // Same-scope placeholders keep paging and refreshes loaded; scope changes
    // have no placeholder and show the cold-load state.
    if (activeObservations.isPending) {
      return { status: "loading" as const, rows: undefined };
    }

    if (activeObservations.isError) {
      if (isSilencedError) {
        // Treat silenced errors as successful with no data
        return { status: "success" as const, rows: [] };
      }
      return { status: "error" as const, rows: undefined };
    }

    // Success case - join the data
    return joinTableCoreAndMetrics<FullEventsObservation, EventBatchIOOutput>(
      activeObservations.data?.observations,
      ioDataQuery.data,
    );
  }, [
    activeObservations.isPending,
    activeObservations.isError,
    activeObservations.data?.observations,
    ioDataQuery.data,
    isSilencedError,
  ]);

  // Fetch the exact count only after the user selects all matching rows.
  const totalCountQuery = api.events.countAll.useQuery(getCountPayload, {
    ...placeholderOptions,
    enabled: selectAll && canLoadAuxiliaryData,
    refetchOnWindowFocus: !rowsEnabled,
    refetchOnReconnect: !rowsEnabled,
  });

  const totalCount = selectAll
    ? (totalCountQuery.data?.totalCount ?? null)
    : null;
  // Approximate distinct trace_id count over the same filtered set, computed
  // alongside totalCount; shares its loading/error state below.
  const uniqueTraceCount = selectAll
    ? (totalCountQuery.data?.uniqueTraceCount ?? null)
    : null;
  const isTotalCountLoading =
    selectAll &&
    totalCount === null &&
    (totalCountQuery.isFetching || !canLoadAuxiliaryData);
  const isTotalCountError =
    selectAll &&
    totalCount === null &&
    totalCountQuery.isError &&
    !totalCountQuery.isFetching;
  const hasMore = activeObservations.data?.hasMore ?? false;

  // Add to queue mutation
  const addToQueueMutation = api.annotationQueueItems.createMany.useMutation({
    onSuccess: (data, variables) => {
      if (variables.isBatchAction || data.createdCount > 0) {
        capture("annotation_queues:item_added", {
          type: "trace",
          source: "ObservationTable",
          targetType: "observation",
          objectType: "OBSERVATION",
          queueCount: 1,
          isV4: true,
          ...(variables.isBatchAction ? {} : { itemCount: data.createdCount }),
        });
      }
      showSuccessToast({
        operation: "observation.add_to_annotation_queue",
        title: "Observations added to queue",
        description: `Selected observations will be added to queue "${data.queueName}". This may take a minute.`,
        link: {
          href: `/project/${projectId}/annotation-queues/${data.queueId}`,
          text: `View queue "${data.queueName}"`,
        },
      });
    },
  });

  // Handler for adding to annotation queue
  const handleAddToAnnotationQueue = async ({
    projectId,
    targetId,
  }: {
    projectId: string;
    targetId: string;
  }) => {
    const visibleObservationIds = new Set(
      (activeObservations.data?.observations ?? [])
        .map((observation) => observation.id)
        .filter((id): id is string => Boolean(id)),
    );

    const selectedObservationIds = Object.keys(selectedRows).filter(
      (observationId) => visibleObservationIds.has(observationId),
    );

    await addToQueueMutation.mutateAsync({
      projectId,
      objectIds: selectedObservationIds,
      objectType: AnnotationQueueObjectType.OBSERVATION,
      queueId: targetId,
      isBatchAction: selectAll,
      query: {
        filter: filterState,
        orderBy: orderByState,
      },
    });
    setSelectedRows({});
  };

  return {
    observations: joinedData,
    /**
     * A fetch over the visible rows — drives the progress bar, not a skeleton.
     * Deliberately excludes the select-all count query: it touches no row on
     * screen, and `isTotalCountLoading` already covers its own UI.
     */
    isFetching: activeObservations.isFetching || ioDataQuery.isFetching,
    /**
     * True once the rows of the current filters, search, time range and
     * project have settled, painted and stopped fetching, and while the user
     * pages or sorts within them; false while the rows on screen refetch.
     * Always true without row queries. Facet scans, counts, and aggregate
     * charts start only then so they do not compete with the row query.
     */
    canLoadAuxiliaryData,
    totalCount,
    uniqueTraceCount,
    isTotalCountLoading,
    isTotalCountError,
    hasMore,
    addToQueueMutation,
    handleAddToAnnotationQueue,
    isIoPending,
    error,
    errorHttpStatus,
    isSilencedError,
    usedAppRootFallback,
  };
}
