import { api } from "@/src/utils/api";
import { useMemo } from "react";
import {
  type FilterState,
  AnnotationQueueObjectType,
  type ScoreAggregate,
} from "@langfuse/shared";
import { type FullEventsObservations } from "@langfuse/shared/src/server";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { type EventBatchIOOutput } from "@/src/features/events/server/eventsRouter";
import { useSSEEventsTableQuery } from "@/src/features/events/hooks/useSSEEventsTableQuery";

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
  searchType?: ("id" | "content")[];
  selectedRows: Record<string, boolean>;
  selectAll: boolean;
  setSelectedRows: (rows: Record<string, boolean>) => void;
  useStreamingListQuery?: boolean;
  refreshKey?: string | number;
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
  useStreamingListQuery = false,
  refreshKey,
}: UseEventsTableDataParams) {
  // Prepare query payloads
  const getCountPayload = useMemo(
    () => ({
      projectId,
      filter: filterState,
      searchQuery: searchQuery ?? null,
      searchType: searchType ?? ["id", "content"],
      page: 1,
      limit: 1,
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

  const observationsTrpc = api.events.all.useQuery(getAllPayload, {
    refetchOnWindowFocus: true,
    enabled: !useStreamingListQuery,
    meta: {
      silentHttpCodes, // Turns off red bubble
    },
  });

  const observationsSSE = useSSEEventsTableQuery(getAllPayload, {
    enabled: useStreamingListQuery,
    refreshKey,
  });
  const observationsData = useStreamingListQuery
    ? observationsSSE.data
    : observationsTrpc.data;
  const observationsIsSuccess = useStreamingListQuery
    ? observationsSSE.isSuccess
    : observationsTrpc.isSuccess;
  const observationsIsLoading = useStreamingListQuery
    ? observationsSSE.isLoading
    : observationsTrpc.isLoading;
  const observationsIsError = useStreamingListQuery
    ? observationsSSE.isError
    : observationsTrpc.isError;
  const observationsError = useStreamingListQuery
    ? observationsSSE.error
    : observationsTrpc.error;
  const observationsDataUpdatedAt = useStreamingListQuery
    ? observationsSSE.dataUpdatedAt
    : observationsTrpc.dataUpdatedAt;
  const observationsProgress = useStreamingListQuery
    ? observationsSSE.progress
    : null;
  const observationsResourceLimitError = useStreamingListQuery
    ? observationsSSE.errorKind === "resource_limit"
    : false;

  const batchIOPayload = useMemo(() => {
    const validObservations =
      observationsData?.observations?.filter(
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
    };
  }, [observationsData?.observations, projectId]);

  // Fetch I/O data
  const ioDataQuery = api.events.batchIO.useQuery(batchIOPayload!, {
    enabled: observationsIsSuccess && batchIOPayload !== null,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  // Extract error information for display (only from observations.all, not batchIO)
  const error = observationsError;

  const errorHttpStatus = useStreamingListQuery
    ? observationsResourceLimitError
      ? 422
      : undefined
    : observationsTrpc.error?.data?.httpStatus;

  const isSilencedError =
    observationsIsError &&
    errorHttpStatus &&
    silentHttpCodes.includes(errorHttpStatus);

  // Memoize joined data to prevent infinite re-renders
  // Handle loading, error, and success states
  const joinedData = useMemo(() => {
    if (observationsIsLoading) {
      return { status: "loading" as const, rows: undefined };
    }

    if (observationsIsError) {
      if (isSilencedError) {
        // Treat silenced errors as successful with no data
        return { status: "success" as const, rows: [] };
      }
      return { status: "error" as const, rows: undefined };
    }

    // Success case - join the data
    return joinTableCoreAndMetrics<FullEventsObservation, EventBatchIOOutput>(
      observationsData?.observations,
      ioDataQuery.data,
    );
  }, [
    observationsData?.observations,
    observationsIsError,
    observationsIsLoading,
    ioDataQuery.data,
    isSilencedError,
  ]);

  // Fetch total count
  const totalCountQuery = api.events.countAll.useQuery(getCountPayload, {
    refetchOnWindowFocus: true,
  });

  const totalCount = totalCountQuery.data?.totalCount ?? null;

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
    const selectedObservationIds = Object.keys(selectedRows).filter(
      (observationId) =>
        (observationsData?.observations ?? [])
          .map((o) => o.id)
          .includes(observationId),
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
    dataUpdatedAt: observationsDataUpdatedAt,
    totalCountQuery,
    totalCount,
    addToQueueMutation,
    handleAddToAnnotationQueue,
    ioLoading: ioDataQuery.isLoading,
    progress: observationsProgress,
    error,
    errorHttpStatus,
    isSilencedError,
  };
}
