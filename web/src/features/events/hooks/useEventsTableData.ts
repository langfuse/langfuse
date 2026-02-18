import { api } from "@/src/utils/api";
import { useMemo } from "react";
import { type FilterState, AnnotationQueueObjectType } from "@langfuse/shared";
import { type FullEventsObservations } from "@langfuse/shared/src/server";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { type EventBatchIOOutput } from "@/src/features/events/server/eventsRouter";

type FullEventsObservation = FullEventsObservations[number];

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

  const observations = api.events.all.useQuery(getAllPayload, {
    refetchOnWindowFocus: true,
  });

  const batchIOPayload = useMemo(() => {
    const validObservations =
      observations.data?.observations?.filter(
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
  }, [observations.data?.observations, projectId]);

  // Fetch I/O data
  const ioDataQuery = api.events.batchIO.useQuery(batchIOPayload!, {
    enabled: observations.isSuccess && batchIOPayload !== null,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  // Memoize joined data to prevent infinite re-renders
  // Include ioDataQuery.isSuccess to ensure re-render when I/O loads
  const joinedData = useMemo(
    () =>
      joinTableCoreAndMetrics<FullEventsObservation, EventBatchIOOutput>(
        observations.data?.observations,
        ioDataQuery.data,
      ),
    [observations.data?.observations, ioDataQuery.data],
  );

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
    ioLoading: ioDataQuery.isLoading,
  };
}
