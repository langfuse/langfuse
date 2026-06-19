import { api, sendAsPostOption } from "@/src/utils/api";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

export type UsePrefetchObservationParams = {
  projectId: string;
};

/**
 * Hook to prefetch observation detail data on hover.
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
      // Beta ON: prefetch the parsed-on-read resolver, not full raw IO.
      // Raw IO remains lazy and is fetched only for fallback/full JSON paths.
      if (!startTime) return;
      utils.events.parsedObservationIO.prefetch(
        {
          projectId,
          observation: { id: observationId, traceId },
          minStartTime: startTime,
          maxStartTime: startTime,
        },
        {
          ...sendAsPostOption,
          staleTime: 5 * 60 * 1000, // 5 minutes
        },
      );
    } else {
      // Beta OFF: prefetch from observations table
      utils.observations.byId.prefetch(
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
