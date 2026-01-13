import { api } from "@/src/utils/api";

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

  const prefetch = (
    observationId: string,
    traceId: string,
    startTime?: Date,
  ) => {
    void utils.observations.byId.prefetch(
      {
        observationId,
        traceId,
        projectId,
        startTime,
      },
      {
        staleTime: 5 * 60 * 1000, // 5 minutes - matches old trace behavior
      },
    );
  };

  return { prefetch };
}
