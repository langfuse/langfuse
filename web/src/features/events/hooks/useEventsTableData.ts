import { api } from "@/src/utils/api";
import { useMemo } from "react";
import {
  type FilterState,
  AnnotationQueueObjectType,
  type EventsObservation,
} from "@langfuse/shared";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { type EventBatchIOOutput } from "@/src/features/events/server/eventsRouter";

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

  // Fetch observations
  const observations = api.events.all.useQuery(getAllPayload, {
    refetchOnWindowFocus: true,
  });

  // Memoize observations for IO query to prevent infinite loops
  const observationsForIO = useMemo(() => {
    const filtered =
      observations.data?.observations
        ?.filter((o) => o.id && o.traceId && o.startTime)
        .map((o) => ({
          id: o.id,
          traceId: o.traceId!,
          startTime: o.startTime!, // Use startTime field name as per schema
        })) ?? [];

    console.log("[useEventsTableData] observationsForIO:", {
      totalObservations: observations.data?.observations?.length ?? 0,
      filteredCount: filtered.length,
      sample: filtered[0],
    });

    return filtered;
  }, [observations.data?.observations]);

  // Fetch I/O data
  const ioDataQuery = api.events.batchIO.useQuery(
    {
      projectId,
      observations: observationsForIO,
    },
    {
      enabled: observations.isSuccess && observationsForIO.length > 0,
      refetchOnWindowFocus: false,
      staleTime: 0,
    },
  );

  // Debug logging for IO query
  console.log("[useEventsTableData] ioDataQuery:", {
    isSuccess: ioDataQuery.isSuccess,
    isLoading: ioDataQuery.isLoading,
    isError: ioDataQuery.isError,
    dataCount: ioDataQuery.data?.length ?? 0,
    sample: ioDataQuery.data?.[0],
  });

  // Memoize joined data to prevent infinite re-renders
  // Include ioDataQuery.isSuccess to ensure re-render when I/O loads
  const joinedData = useMemo(() => {
    const result = joinTableCoreAndMetrics<
      EventsObservation,
      EventBatchIOOutput
    >(observations.data?.observations, ioDataQuery.data);

    // Debug logging
    console.log("[useEventsTableData] Joining data:", {
      coreObservationsCount: observations.data?.observations?.length ?? 0,
      ioQueryStatus: {
        isLoading: ioDataQuery.isLoading,
        isSuccess: ioDataQuery.isSuccess,
        dataCount: ioDataQuery.data?.length ?? 0,
      },
      joinResult: {
        status: result.status,
        rowsCount: result.rows?.length ?? 0,
      },
    });

    if (result.status === "success" && result.rows && result.rows.length > 0) {
      console.log("[useEventsTableData] First row details:", {
        firstCoreObs: observations.data?.observations?.[0]
          ? {
              id: observations.data.observations[0].id,
              hasInput: "input" in observations.data.observations[0],
              inputValue: observations.data.observations[0].input,
            }
          : null,
        firstIOData: ioDataQuery.data?.[0],
        firstJoinedRow: {
          id: result.rows[0].id,
          hasInput: "input" in result.rows[0],
          inputValue: result.rows[0].input,
          hasOutput: "output" in result.rows[0],
          outputValue: result.rows[0].output,
        },
      });
    }

    return result;
  }, [
    observations.data?.observations,
    ioDataQuery.data,
    ioDataQuery.isSuccess,
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
        (observations.data?.observations ?? [])
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
    dataUpdatedAt: observations.dataUpdatedAt,
    totalCountQuery,
    totalCount,
    addToQueueMutation,
    handleAddToAnnotationQueue,
  };
}
