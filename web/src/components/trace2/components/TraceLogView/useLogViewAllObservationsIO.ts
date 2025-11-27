/**
 * Hook for batch-loading all observation I/O data.
 *
 * Used by LogViewJsonMode to load all observations upfront for JSON view.
 * Uses useQueries to batch load all observations in parallel.
 */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/src/utils/api";
import { type FlatLogItem } from "./log-view-types";
import { formatDisplayName } from "./log-view-formatters";

export interface UseLogViewAllObservationsIOParams {
  items: FlatLogItem[];
  traceId: string;
  projectId: string;
  /** Only fetch when true */
  enabled: boolean;
}

export interface ObservationIOData {
  id: string;
  type: string;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
}

/**
 * Fetches all observation I/O data (input, output, metadata) in parallel.
 *
 * @param params - Parameters including items array, traceId, projectId, and enabled flag
 * @returns Combined data object, loading state, and individual observation data
 */
export function useLogViewAllObservationsIO({
  items,
  traceId,
  projectId,
  enabled,
}: UseLogViewAllObservationsIOParams) {
  const utils = api.useUtils();

  const queries = useQueries({
    queries: items.map((item) => ({
      queryKey: [
        "observations",
        "byId",
        {
          observationId: item.node.id,
          traceId,
          projectId,
          startTime: item.node.startTime,
        },
      ],
      queryFn: async () => {
        const result = await utils.observations.byId.fetch({
          observationId: item.node.id,
          traceId,
          projectId,
          startTime: item.node.startTime,
        });
        return {
          ...result,
          _displayName: formatDisplayName(item.node),
          _type: item.node.type,
        };
      },
      enabled,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  // Combine all loaded data into a single object keyed by display name
  const combinedData = useMemo(() => {
    if (isLoading || !enabled) return null;

    const result: Record<string, ObservationIOData> = {};

    queries.forEach((query) => {
      if (query.data) {
        const data = query.data as {
          id: string;
          input: unknown;
          output: unknown;
          metadata: unknown;
          _displayName: string;
          _type: string;
        };

        // Build clean entry, filtering out null/undefined values
        const cleanEntry: ObservationIOData = {
          id: data.id,
          type: data._type,
        };

        if (data.input !== null && data.input !== undefined) {
          cleanEntry.input = data.input;
        }
        if (data.output !== null && data.output !== undefined) {
          cleanEntry.output = data.output;
        }
        if (data.metadata !== null && data.metadata !== undefined) {
          cleanEntry.metadata = data.metadata;
        }

        result[data._displayName] = cleanEntry;
      }
    });

    return Object.keys(result).length > 0 ? result : null;
  }, [queries, isLoading, enabled]);

  return {
    data: combinedData,
    isLoading,
    isError,
    loadedCount: queries.filter((q) => q.data).length,
    totalCount: items.length,
  };
}
