import { api } from "@/src/utils/api";

export type UseTraceDataParams = {
  traceId: string;
  projectId: string;
  timestamp?: Date;
};

export function useTraceData({
  traceId,
  projectId,
  timestamp,
}: UseTraceDataParams) {
  const query = api.traces.byIdWithObservationsAndScores.useQuery(
    {
      traceId,
      timestamp,
      projectId,
    },
    {
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 3;
      },
    },
  );

  return {
    trace: query.data,
    observations: query.data?.observations ?? [],
    scores: query.data?.scores ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
