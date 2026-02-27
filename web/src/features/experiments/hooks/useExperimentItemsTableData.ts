import { useMemo } from "react";
import { type FilterState, type ScoreAggregate } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";

/**
 * Core data for an experiment item (from items query)
 */
type ExperimentItemCoreData = {
  id: string; // experiment_item_id
  experimentId: string;
  traceId: string;
  datasetItemId: string;
  createdAt: Date;
  input?: string;
  output?: string;
  expectedOutput?: string;
  itemMetadata?: Record<string, unknown>;
};

/**
 * Metrics data for an experiment item (from itemMetrics query)
 */
type ExperimentItemMetricsData = {
  id: string; // experiment_item_id - used for joining
  totalCost: number | null;
  latencyMs: number | null;
  scores: ScoreAggregate;
};

type UseExperimentItemsTableDataParams = {
  projectId: string;
  experimentId: string;
  filterState: FilterState;
  paginationState: {
    page: number;
    limit: number;
  };
  orderByState: {
    column: string;
    order: "ASC" | "DESC";
  } | null;
};

/**
 * Custom hook for fetching experiment items table data.
 * Follows the 3-query pattern:
 * 1. items - Core row data with pagination
 * 2. itemsCount - Total count for pagination
 * 3. itemMetrics - Metrics (cost, latency, scores) for visible items
 */
export function useExperimentItemsTableData({
  projectId,
  experimentId,
  filterState,
  paginationState,
  orderByState,
}: UseExperimentItemsTableDataParams) {
  // Prepare query payloads
  const getCountPayload = useMemo(
    () => ({
      projectId,
      experimentId,
      filter: filterState,
    }),
    [projectId, experimentId, filterState],
  );

  const getAllPayload = useMemo(
    () => ({
      projectId,
      experimentId,
      filter: filterState,
      page: paginationState.page - 1, // Backend uses 0-indexed pages
      limit: paginationState.limit,
      orderBy: orderByState,
    }),
    [
      projectId,
      experimentId,
      filterState,
      paginationState.page,
      paginationState.limit,
      orderByState,
    ],
  );

  // Fetch experiment items
  const itemsQuery = api.experiments.items.useQuery(getAllPayload, {
    refetchOnWindowFocus: true,
  });

  // Build metrics payload based on items data
  const metricsPayload = useMemo(() => {
    const data = itemsQuery.data?.data as ExperimentItemCoreData[] | undefined;
    if (!data || data.length === 0) {
      return null;
    }

    return {
      projectId,
      experimentId,
      experimentItemIds: data.map((item) => item.id),
      filter: filterState,
    };
  }, [itemsQuery.data?.data, projectId, experimentId, filterState]);

  // Fetch metrics for visible items
  const metricsQuery = api.experiments.itemMetrics.useQuery(metricsPayload!, {
    enabled: itemsQuery.isSuccess && metricsPayload !== null,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  // Fetch total count
  const totalCountQuery = api.experiments.itemsCount.useQuery(getCountPayload, {
    refetchOnWindowFocus: true,
  });

  const totalCount = totalCountQuery.data?.count ?? null;

  // Memoize joined data to prevent infinite re-renders
  // Handle loading, error, and success states
  const joinedData = useMemo(() => {
    if (itemsQuery.isLoading) {
      return { status: "loading" as const, rows: undefined };
    }

    if (itemsQuery.isError) {
      return { status: "error" as const, rows: undefined };
    }

    // Success case - join the data
    return joinTableCoreAndMetrics<
      ExperimentItemCoreData,
      ExperimentItemMetricsData
    >(
      itemsQuery.data?.data as ExperimentItemCoreData[] | undefined,
      metricsQuery.data as ExperimentItemMetricsData[] | undefined,
    );
  }, [
    itemsQuery.isLoading,
    itemsQuery.isError,
    itemsQuery.data?.data,
    metricsQuery.data,
  ]);

  const dataUpdatedAt = itemsQuery.dataUpdatedAt;

  return {
    items: joinedData,
    dataUpdatedAt,
    totalCount,
    metricsLoading: metricsQuery.isLoading,
  };
}
