import { api } from "@/src/utils/api";

export type UseMediaParams = {
  projectId: string;
  traceId: string;
  observationId?: string;
};

/**
 * Hook to fetch media attachments for a trace or observation.
 *
 * @param projectId - Project ID
 * @param traceId - Trace ID (required)
 * @param observationId - Observation ID (optional, for observation-level media)
 */
export function useMedia({
  projectId,
  traceId,
  observationId,
}: UseMediaParams) {
  return api.media.getByTraceOrObservationId.useQuery(
    {
      projectId,
      traceId,
      observationId,
    },
    {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 50 * 60 * 1000, // 50 minutes
    },
  );
}
