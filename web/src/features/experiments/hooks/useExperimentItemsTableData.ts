import { useMemo } from "react";
import { type FilterState } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import {
  type ExperimentItemsTableRow,
  type ExperimentOutputData,
} from "../components/table/types";

type UseExperimentItemsTableDataParams = {
  projectId: string;
  baseExperimentId?: string;
  compExperimentIds: string[];
  filterByExperiment: {
    experimentId: string;
    filters: FilterState;
  }[];
  paginationState: {
    page: number;
    limit: number;
  };
  orderByState: {
    column: string;
    order: "ASC" | "DESC";
  } | null;
  itemVisibility?: "baseline-only" | "all";
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
  baseExperimentId,
  compExperimentIds,
  filterByExperiment,
  paginationState,
  orderByState,
  itemVisibility,
}: UseExperimentItemsTableDataParams) {
  const hasSelectedRuns =
    Boolean(baseExperimentId) || compExperimentIds.length > 0;

  // Prepare query payloads
  const getCountPayload = useMemo(
    () => ({
      projectId,
      baseExperimentId,
      compExperimentIds,
      filterByExperiment,
      itemVisibility,
    }),
    [
      projectId,
      baseExperimentId,
      compExperimentIds,
      filterByExperiment,
      itemVisibility,
    ],
  );

  const getAllPayload = useMemo(
    () => ({
      projectId,
      baseExperimentId,
      compExperimentIds,
      filterByExperiment,
      page: paginationState.page - 1, // Backend uses 0-indexed pages
      limit: paginationState.limit,
      orderBy: orderByState,
      itemVisibility,
    }),
    [
      projectId,
      baseExperimentId,
      compExperimentIds,
      filterByExperiment,
      paginationState.page,
      paginationState.limit,
      orderByState,
      itemVisibility,
    ],
  );

  // Fetch experiment items
  const itemsQuery = api.experiments.items.useQuery(getAllPayload, {
    enabled: hasSelectedRuns,
    refetchOnWindowFocus: true,
  });

  // Fetch total count
  const totalCountQuery = api.experiments.itemsCount.useQuery(getCountPayload, {
    enabled: hasSelectedRuns,
    refetchOnWindowFocus: true,
  });

  const totalCount = hasSelectedRuns
    ? (totalCountQuery.data?.count ?? null)
    : 0;

  // Build batchIO payload based on items data
  const batchIOPayload = useMemo(() => {
    const data = itemsQuery.data?.data;
    if (!data || data.length === 0) {
      return null;
    }

    return {
      projectId,
      itemIds: data.map((item) => item.itemId),
      baseExperimentId,
      compExperimentIds,
    };
  }, [itemsQuery.data?.data, projectId, baseExperimentId, compExperimentIds]);

  // Fetch IO data for visible items
  const batchIOQuery = api.experiments.batchIO.useQuery(batchIOPayload!, {
    enabled: hasSelectedRuns && itemsQuery.isSuccess && batchIOPayload !== null,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  // Merge items with IO data
  const joinedData = useMemo(() => {
    if (!hasSelectedRuns) {
      return {
        status: "success" as const,
        rows: [] as ExperimentItemsTableRow[],
      };
    }

    if (itemsQuery.isLoading) {
      return { status: "loading" as const, rows: undefined };
    }

    if (itemsQuery.isError) {
      return { status: "error" as const, rows: undefined };
    }

    const items = itemsQuery.data?.data;
    if (!items) {
      return {
        status: "success" as const,
        rows: [] as ExperimentItemsTableRow[],
      };
    }

    // Create a map of itemId -> IO data for fast lookup
    const ioMap = new Map<
      string,
      {
        input: string | null;
        expectedOutput: string | null;
        outputs: ExperimentOutputData[];
      }
    >();

    if (batchIOQuery.data) {
      for (const io of batchIOQuery.data) {
        ioMap.set(io.itemId, {
          input: io.input,
          expectedOutput: io.expectedOutput,
          outputs: io.outputs,
        });
      }
    }

    // Merge items with IO data
    const mergedRows: ExperimentItemsTableRow[] = items.map((item) => {
      const io = ioMap.get(item.itemId);
      return {
        ...item,
        input: io?.input ?? null,
        expectedOutput: io?.expectedOutput ?? null,
        outputs: io?.outputs ?? [],
      };
    });

    return { status: "success" as const, rows: mergedRows };
  }, [
    hasSelectedRuns,
    itemsQuery.isLoading,
    itemsQuery.isError,
    itemsQuery.data?.data,
    batchIOQuery.data,
  ]);

  const dataUpdatedAt = itemsQuery.dataUpdatedAt;

  return {
    items: joinedData,
    dataUpdatedAt,
    totalCount,
    ioLoading: batchIOQuery.isLoading,
  };
}
