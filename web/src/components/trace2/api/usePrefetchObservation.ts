import { api } from "@/src/utils/api";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

export type UsePrefetchObservationParams = {
  projectId: string;
};

/**
 * Hook to prefetch observation data on hover.
 * Matches the old trace component's prefetch behavior with 5-minute staleTime.
 */
export function usePrefetchObservation({
  projectId,
}: UsePrefetchObservationParams) {
  const utils = api.useUtils();
  const { isBetaEnabled } = useV4Beta();

  const prefetch = (
    observationId: string,
    traceId: string,
    startTime?: Date,
  ) => {
    if (isBetaEnabled) {
      // Beta ON: prefetch from events table via batchIO
      if (!startTime) return;
      void utils.events.batchIO.prefetch(
        {
          projectId,
          observations: [{ id: observationId, traceId }],
          minStartTime: startTime,
          maxStartTime: startTime,
          truncated: false, // Must match useLogViewObservationIO for cache hit
        },
        {
          staleTime: 5 * 60 * 1000, // 5 minutes
        },
      );
    } else {
      // Beta OFF: prefetch from observations table
      void utils.observations.byId.prefetch(
        {
          observationId,
          traceId,
          projectId,
          startTime,
        },
        {
          staleTime: 5 * 60 * 1000, // 5 minutes
        },
      );
    }
  };

  return { prefetch };
}
