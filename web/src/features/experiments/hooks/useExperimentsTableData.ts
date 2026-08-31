import { useMemo } from "react";
import { type FilterState, type ScoreAggregate } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";

type ExperimentCoreData = {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, string>;
  prompts: Array<[string, number | null]>;
  datasetId: string;
  startTime: Date;
  itemCount: number;
  errorCount: number;
};

type ExperimentMetricsData = {
  id: string;
  totalCost: number | null;
  latencyAvg: number | null;
  traceItemScores: ScoreAggregate; // Scores on traces (observation_id IS NULL)
  observationItemScores: ScoreAggregate; // Scores on observations (observation_id IS NOT NULL)
  experimentScores: ScoreAggregate; // Experiment-level scores
};

type UseExperimentsTableDataParams = {
  projectId: string;
  filterState: FilterState;
  paginationState: {
    page: number;
    limit: number;
  };
  /**
   * Hold the queries while a filter value still needs translating. A dataset
   * NAME reaches the query as an id, so firing before the name -> id map lands
   * would query a bogus id and show "No experiments" before flipping to the
   * real rows.
   */
  enabled?: boolean;
  orderByState: {
    column: string;
    order: "ASC" | "DESC";
  } | null;
};

export function useExperimentsTableData({
  projectId,
  filterState,
  paginationState,
  orderByState,
  enabled = true,
}: UseExperimentsTableDataParams) {
  // Prepare query payloads
  const getCountPayload = useMemo(
    () => ({
      projectId,
      filter: filterState,
    }),
    [projectId, filterState],
  );

  const getAllPayload = useMemo(
    () => ({
      ...getCountPayload,
      page: paginationState.page - 1, // Backend uses 0-indexed pages
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

  // Fetch experiments
  const experimentsQuery = api.experiments.all.useQuery(getAllPayload, {
    refetchOnWindowFocus: true,
    enabled,
  });

  // Build metrics payload based on experiments data
  const metricsPayload = useMemo(() => {
    const experiments = experimentsQuery.data?.data;
    if (!experiments || experiments.length === 0) {
      return null;
    }

    return {
      projectId,
      experimentIds: experiments.map((e) => e.id),
      filter: filterState,
    };
  }, [experimentsQuery.data?.data, projectId, filterState]);

  // Fetch metrics
  const metricsQuery = api.experiments.metrics.useQuery(metricsPayload!, {
    enabled: enabled && experimentsQuery.isSuccess && metricsPayload !== null,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  // Fetch total count
  const totalCountQuery = api.experiments.countAll.useQuery(getCountPayload, {
    enabled,
    refetchOnWindowFocus: true,
  });

  const totalCount = totalCountQuery.data?.count ?? null;

  // Memoize joined data to prevent infinite re-renders
  // Handle loading, error, and success states
  const joinedData = useMemo(() => {
    if (!enabled || experimentsQuery.isLoading) {
      return { status: "loading" as const, rows: undefined };
    }

    if (experimentsQuery.isError) {
      return { status: "error" as const, rows: undefined };
    }

    // Success case - join the data
    return joinTableCoreAndMetrics<ExperimentCoreData, ExperimentMetricsData>(
      experimentsQuery.data?.data,
      metricsQuery.data,
    );
  }, [
    enabled,
    experimentsQuery.isLoading,
    experimentsQuery.isError,
    experimentsQuery.data?.data,
    metricsQuery.data,
  ]);

  const dataUpdatedAt = experimentsQuery.dataUpdatedAt;

  return {
    experiments: joinedData,
    dataUpdatedAt,
    totalCount,
    metricsLoading: metricsQuery.isLoading,
  };
}
