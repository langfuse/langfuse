import { api } from "@/src/utils/api";
import { useMemo } from "react";

interface UseEventsTableIOParams {
  projectId: string;
  observations: Array<{
    id: string;
    traceId?: string;
    startTime?: Date;
  }>;
  enabled: boolean;
}

export function useEventsTableIO({
  projectId,
  observations,
  enabled,
}: UseEventsTableIOParams) {
  // Prepare batch input - filter observations with both traceId and startTime
  const batchInput = useMemo(
    () => ({
      projectId,
      observations: observations
        .filter((o) => o.startTime && o.traceId)
        .map((o) => ({
          id: o.id,
          traceId: o.traceId!,
          startTime: o.startTime!,
        })),
    }),
    [projectId, observations],
  );

  // Fetch I/O data
  const ioDataQuery = api.events.batchIO.useQuery(batchInput, {
    enabled: enabled && observations.length > 0,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  // Convert to Map for O(1) lookups
  const ioDataMap = useMemo(() => {
    if (!ioDataQuery.data) return new Map();
    return new Map(ioDataQuery.data.map((item) => [item.id, item]));
  }, [ioDataQuery.data]);

  return {
    ioDataMap,
    isLoading: ioDataQuery.isLoading,
    isError: ioDataQuery.isError,
  };
}
