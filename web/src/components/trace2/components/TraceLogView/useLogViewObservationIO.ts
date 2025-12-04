/**
 * Hook for lazy-loading observation I/O data.
 *
 * Only fetches when `enabled` is true (row is expanded).
 * Uses staleTime: Infinity to cache results indefinitely within the session.
 */

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/utils/api";
import { type FlatLogItem } from "./log-view-types";

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

/**
 * Hook to count how many observations have their I/O data loaded in the cache.
 * Useful for showing progress indicator in virtualized mode.
 */
export function useObservationIOLoadedCount({
  items,
  traceId,
  projectId,
}: {
  items: FlatLogItem[];
  traceId: string;
  projectId: string;
}): { loaded: number; total: number } {
  const queryClient = useQueryClient();

  return useMemo(() => {
    // Filter out TRACE type (which doesn't have observation I/O)
    const observationItems = items.filter((item) => item.node.type !== "TRACE");
    const total = observationItems.length;

    let loaded = 0;
    for (const item of observationItems) {
      // Build the same query key that tRPC uses
      const queryKey = [
        ["observations", "byId"],
        {
          input: {
            observationId: item.node.id,
            traceId,
            projectId,
            startTime: item.node.startTime,
          },
          type: "query",
        },
      ];

      const state = queryClient.getQueryState(queryKey);
      if (state?.status === "success") {
        loaded++;
      }
    }

    return { loaded, total };
  }, [items, traceId, projectId, queryClient]);
}
