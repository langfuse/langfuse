/**
 * Hook for lazy-loading observation I/O data.
 *
 * Only fetches when `enabled` is true (row is expanded).
 * Uses staleTime: Infinity to cache results indefinitely within the session.
 */

import { api } from "@/src/utils/api";

export interface UseLogViewObservationIOParams {
  observationId: string;
  traceId: string;
  projectId: string;
  startTime: Date;
  /** Only fetch when true (row is expanded) */
  enabled: boolean;
}

/**
 * Fetches observation I/O data (input, output, metadata) lazily.
 *
 * @param params - Parameters including observationId, traceId, projectId, startTime, and enabled flag
 * @returns Query result with observation data, loading state, and error state
 */
export function useLogViewObservationIO({
  observationId,
  traceId,
  projectId,
  startTime,
  enabled,
}: UseLogViewObservationIOParams) {
  return api.observations.byId.useQuery(
    {
      observationId,
      traceId,
      projectId,
      startTime,
    },
    {
      enabled,
      // Cache indefinitely within session - data doesn't change
      staleTime: Infinity,
      // Don't refetch on window focus
      refetchOnWindowFocus: false,
    },
  );
}
