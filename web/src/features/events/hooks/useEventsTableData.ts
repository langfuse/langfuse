import { api, sendAsPostOption } from "@/src/utils/api";
import { useMemo } from "react";
import {
  type FilterState,
  AnnotationQueueObjectType,
  type TracingSearchType,
  type ScoreAggregate,
} from "@langfuse/shared";
import { type FullEventsObservations } from "@langfuse/shared/src/server";
import { showSuccessToast } from "@/src/features/notifications";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { usePendingRowIds } from "@/src/components/table/hooks/usePendingRowIds";
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
   * Chars of I/O to fetch per cell. Undefined keeps the cheap pre-truncated
   * read, which holds too little text to fill a taller row (LFE-14586).
   */
  ioCharLimit?: number;
};

export function useEventsTableData({
  projectId,
  filterState,
  paginationState,
  orderByState,
  searchQuery,
  searchType,
  selectedRows,
  selectAll,
  setSelectedRows,
  appRootFallbackEnabled = false,
  rowsEnabled = true,
  ioCharLimit,
}: UseEventsTableDataParams) {
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

  const observations = api.events.all.useQuery(getAllPayload, {
    enabled: rowsEnabled,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
    meta: {
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
    meta: { silentHttpCodes },
  });
  const activeObservations =
    shouldRunAppRootFallback && !appRootFallbackQuery.isError
      ? appRootFallbackQuery
      : observations;
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
    enabled:
      rowsEnabled && activeObservations.isSuccess && batchIOPayload !== null,
    refetchOnWindowFocus: false,
    staleTime: 0,
    placeholderData: (prev) => prev,
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
    // Placeholder data is the previous key's rows: report them as loaded so a
    // filter/page/sort change keeps them on screen. "loading" now means the
    // table has nothing to show at all.
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
    enabled: selectAll,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
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
    selectAll && totalCount === null && totalCountQuery.isFetching;
  const isTotalCountError =
    selectAll &&
    totalCount === null &&
    totalCountQuery.isError &&
    !totalCountQuery.isFetching;
  const hasMore = activeObservations.data?.hasMore ?? false;

  // Add to queue mutation
  const addToQueueMutation = api.annotationQueueItems.createMany.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
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
