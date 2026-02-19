import { api } from "@/src/utils/api";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useEventsTraceData } from "@/src/features/events/hooks/useEventsTraceData";

type UsePeekDataProps = {
  projectId: string;
  traceId?: string;
  timestamp?: Date;
};

export const usePeekData = ({
  projectId,
  traceId,
  timestamp,
}: UsePeekDataProps) => {
  const { isBetaEnabled } = useV4Beta();

  // Old path: fetch from traces table (beta OFF)
  const tracesQuery = api.traces.byIdWithObservationsAndScores.useQuery(
    {
      traceId: traceId as string,
      projectId,
      timestamp,
    },
    {
      enabled: !!traceId && !isBetaEnabled,
      retry(failureCount, error) {
        if (error.data?.code === "UNAUTHORIZED") return false;
        return failureCount < 3;
      },
      staleTime: 60 * 1000, // 1 minute
    },
  );

  // New path: fetch from events table (beta ON)
  const eventsData = useEventsTraceData({
    projectId,
    traceId: traceId ?? "",
    timestamp,
    enabled: !!traceId && isBetaEnabled,
  });

  // Return the appropriate data based on beta toggle
  if (isBetaEnabled) {
    return {
      data: eventsData.data,
      isLoading: eventsData.isLoading,
      error: eventsData.error,
      // Provide stub for other fields to match tracesQuery return type
      isError: !!eventsData.error,
      isFetching: eventsData.isLoading,
    };
  }

  return tracesQuery;
};
