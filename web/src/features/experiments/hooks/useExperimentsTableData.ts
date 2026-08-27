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

/**
 * How many runs the empty-window fallback shows: enough to see what the last
 * runs were, few enough that it reads as a fallback rather than a result set.
 */
const MOST_RECENT_FALLBACK_LIMIT = 10;

type UseExperimentsTableDataParams = {
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
};

export function useExperimentsTableData({
  projectId,
  filterState,
  paginationState,
  orderByState,
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

  // `projectId` is read from `router.query`, which Next.js populates only after
  // hydration. Without this guard both queries fire with `projectId: undefined`
  // on a cold load and the rejected zod input surfaces as a "Bad Request" toast.
  const isProjectReady = Boolean(projectId);

  // Fetch experiments
  const experimentsQuery = api.experiments.all.useQuery(getAllPayload, {
    enabled: isProjectReady,
    refetchOnWindowFocus: true,
  });

  // Fetch total count
  const totalCountQuery = api.experiments.countAll.useQuery(getCountPayload, {
    enabled: isProjectReady,
    refetchOnWindowFocus: true,
  });

  // An empty time range hides runs that exist just outside it, which reads as
  // "there are no experiments". Fall back to the most recent runs instead — on
  // the first page only, so paging stays honest.
  const isEmptyWindow =
    totalCountQuery.data?.count === 0 && paginationState.page === 1;

  const mostRecentQuery = api.experiments.mostRecent.useQuery(
    { ...getCountPayload, limit: MOST_RECENT_FALLBACK_LIMIT },
    {
      enabled: isProjectReady && isEmptyWindow,
      refetchOnWindowFocus: false,
    },
  );

  const fallbackRows = isEmptyWindow ? mostRecentQuery.data?.data : undefined;
  const isShowingMostRecent = Boolean(fallbackRows?.length);

  // The rows the table renders: the filtered page, or the fallback when the
  // selected range holds nothing.
  const coreRows = isShowingMostRecent
    ? fallbackRows
    : experimentsQuery.data?.data;

  const totalCount = isShowingMostRecent
    ? (fallbackRows?.length ?? null)
    : (totalCountQuery.data?.count ?? null);

  // Build metrics payload based on the rows in view
  const metricsPayload = useMemo(() => {
    if (!coreRows || coreRows.length === 0) {
      return null;
    }

    return {
      projectId,
      experimentIds: coreRows.map((e) => e.id),
      filter: filterState,
    };
  }, [coreRows, projectId, filterState]);

  // Fetch metrics
  const metricsQuery = api.experiments.metrics.useQuery(metricsPayload!, {
    enabled: isProjectReady && metricsPayload !== null,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  // Memoize joined data to prevent infinite re-renders
  // Handle loading, error, and success states
  const joinedData = useMemo(() => {
    // A disabled query is neither loading nor errored, so keep the table in its
    // loading state until the project id arrives instead of flashing "no rows".
    if (!isProjectReady || experimentsQuery.isLoading) {
      return { status: "loading" as const, rows: undefined };
    }

    if (experimentsQuery.isError) {
      return { status: "error" as const, rows: undefined };
    }

    // Don't render "no experiments" while the fallback is still in flight.
    if (isEmptyWindow && mostRecentQuery.isLoading) {
      return { status: "loading" as const, rows: undefined };
    }

    // Success case - join the data
    return joinTableCoreAndMetrics<ExperimentCoreData, ExperimentMetricsData>(
      coreRows,
      metricsQuery.data,
    );
  }, [
    isProjectReady,
    experimentsQuery.isLoading,
    experimentsQuery.isError,
    isEmptyWindow,
    mostRecentQuery.isLoading,
    coreRows,
    metricsQuery.data,
  ]);

  const dataUpdatedAt = experimentsQuery.dataUpdatedAt;

  return {
    experiments: joinedData,
    dataUpdatedAt,
    totalCount,
    metricsLoading: metricsQuery.isLoading,
    /** The rows shown are the most recent runs, not the selected time range. */
    isShowingMostRecent,
    mostRecentLimit: MOST_RECENT_FALLBACK_LIMIT,
  };
}
