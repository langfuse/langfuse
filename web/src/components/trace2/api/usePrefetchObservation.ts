import { api } from "@/src/utils/api";

export type UsePrefetchObservationParams = {
  projectId: string;
};

export function usePrefetchObservation({
  projectId,
}: UsePrefetchObservationParams) {
  const utils = api.useUtils();

  const prefetch = (observationId: string, traceId: string) => {
    void utils.observations.byIdWithIOAndEvents.prefetch({
      observationId,
      traceId,
      projectId,
    });
  };

  return { prefetch };
}
