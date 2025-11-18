import { api } from "@/src/utils/api";
import { useMemo } from "react";
import { type FilterState, AnnotationQueueObjectType } from "@langfuse/shared";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

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
    observations,
    totalCountQuery,
    totalCount,
    addToQueueMutation,
    handleAddToAnnotationQueue,
  };
}
