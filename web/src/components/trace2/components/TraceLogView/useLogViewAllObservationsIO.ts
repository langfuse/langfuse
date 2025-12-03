/**
 * Hook for on-demand batch-loading all observation I/O data.
 *
 * IMPORTANT: This hook does NOT fetch data automatically.
 * Call `loadAllData()` to trigger fetching when needed (e.g., download button click).
 *
 * This avoids creating 10k+ queries on mount which would freeze the browser.
 */

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { chunk } from "lodash";
import { api } from "@/src/utils/api";
import { TRACE_VIEW_CONFIG } from "@/src/components/trace2/config/trace-view-config";
import { type FlatLogItem } from "./log-view-types";
import { formatDisplayName } from "./log-view-formatters";

// Max concurrent requests when loading all observation data
const FETCH_CONCURRENCY = TRACE_VIEW_CONFIG.logView.batchFetch.concurrency;

export interface UseLogViewAllObservationsIOParams {
  items: FlatLogItem[];
  traceId: string;
  projectId: string;
}

export interface ObservationIOData {
  id: string;
  type: string;
  name: string;
  startTime: Date;
  endTime?: Date | null;
  depth: number;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
}

/**
 * Build the tRPC query key for an observation.
 * Must match the format used by api.observations.byId.useQuery
 */
export function getObservationQueryKey(
  observationId: string,
  traceId: string,
  projectId: string,
  startTime: Date,
) {
  return [
    ["observations", "byId"],
    {
      input: { observationId, traceId, projectId, startTime },
      type: "query",
    },
  ];
}

/**
 * Hook for on-demand loading of all observation I/O data.
 *
 * Does NOT auto-fetch. Call `loadAllData()` to trigger.
 *
 * @param params - Items array, traceId, projectId
 * @returns loadAllData function, loading state, data, and error state
 */
export function useLogViewAllObservationsIO({
  items,
  traceId,
  projectId,
}: UseLogViewAllObservationsIOParams) {
  const utils = api.useUtils();
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [data, setData] = useState<ObservationIOData[] | null>(null);
  const [failedObservationIds, setFailedObservationIds] = useState<string[]>(
    [],
  );

  /**
   * Build download data from tree structure + any cached observation I/O.
   * This is synchronous and doesn't fetch new data - only uses what's cached.
   */
  const buildDataFromCache = useCallback((): ObservationIOData[] => {
    return items
      .filter((item) => item.node.type !== "TRACE")
      .map((item) => {
        const baseData: ObservationIOData = {
          id: item.node.id,
          type: item.node.type,
          name: formatDisplayName(item.node),
          startTime: item.node.startTime,
          endTime: item.node.endTime,
          depth: item.node.depth,
        };

        // Check if we have cached I/O data for this observation
        const queryKey = getObservationQueryKey(
          item.node.id,
          traceId,
          projectId,
          item.node.startTime,
        );
        const cachedData = queryClient.getQueryData(queryKey) as
          | { input?: unknown; output?: unknown; metadata?: unknown }
          | undefined;

        if (cachedData) {
          if (cachedData.input !== null && cachedData.input !== undefined) {
            baseData.input = cachedData.input;
          }
          if (cachedData.output !== null && cachedData.output !== undefined) {
            baseData.output = cachedData.output;
          }
          if (
            cachedData.metadata !== null &&
            cachedData.metadata !== undefined
          ) {
            baseData.metadata = cachedData.metadata;
          }
        }

        return baseData;
      });
  }, [items, traceId, projectId, queryClient]);

  /**
   * Load all observation I/O data, using cache where available.
   * Only fetches observations not already in React Query cache.
   * Returns the combined data once all fetches complete.
   * Tracks failures and continues downloading remaining observations.
   */
  const loadAllData = useCallback(async (): Promise<ObservationIOData[]> => {
    setIsLoading(true);
    setIsError(false);
    setFailedObservationIds([]);

    try {
      const observationItems = items.filter(
        (item) => item.node.type !== "TRACE",
      );

      // Separate cached vs uncached items
      const cachedResults: ObservationIOData[] = [];
      const uncachedItems: FlatLogItem[] = [];

      for (const item of observationItems) {
        const queryKey = getObservationQueryKey(
          item.node.id,
          traceId,
          projectId,
          item.node.startTime,
        );
        const cachedData = queryClient.getQueryData(queryKey) as
          | { input?: unknown; output?: unknown; metadata?: unknown }
          | undefined;

        if (cachedData) {
          // Build data from cache
          const baseData: ObservationIOData = {
            id: item.node.id,
            type: item.node.type,
            name: formatDisplayName(item.node),
            startTime: item.node.startTime,
            endTime: item.node.endTime,
            depth: item.node.depth,
          };
          if (cachedData.input !== null && cachedData.input !== undefined) {
            baseData.input = cachedData.input;
          }
          if (cachedData.output !== null && cachedData.output !== undefined) {
            baseData.output = cachedData.output;
          }
          if (
            cachedData.metadata !== null &&
            cachedData.metadata !== undefined
          ) {
            baseData.metadata = cachedData.metadata;
          }
          cachedResults.push(baseData);
        } else {
          uncachedItems.push(item);
        }
      }

      // Track failed observation IDs
      const failures: string[] = [];

      // Fetch uncached items in batches to avoid rate limiting
      const itemChunks = chunk(uncachedItems, FETCH_CONCURRENCY);
      const fetchedResults: ObservationIOData[] = [];

      for (const itemChunk of itemChunks) {
        const chunkResults = await Promise.all(
          itemChunk.map(async (item) => {
            try {
              const result = await utils.observations.byId.fetch({
                observationId: item.node.id,
                traceId,
                projectId,
                startTime: item.node.startTime,
              });

              const baseData: ObservationIOData = {
                id: item.node.id,
                type: item.node.type,
                name: formatDisplayName(item.node),
                startTime: item.node.startTime,
                endTime: item.node.endTime,
                depth: item.node.depth,
              };

              if (result.input !== null && result.input !== undefined) {
                baseData.input = result.input;
              }
              if (result.output !== null && result.output !== undefined) {
                baseData.output = result.output;
              }
              if (result.metadata !== null && result.metadata !== undefined) {
                baseData.metadata = result.metadata;
              }

              return baseData;
            } catch {
              // Track failure and return base data without I/O
              failures.push(item.node.id);
              return {
                id: item.node.id,
                type: item.node.type,
                name: formatDisplayName(item.node),
                startTime: item.node.startTime,
                endTime: item.node.endTime,
                depth: item.node.depth,
              } as ObservationIOData;
            }
          }),
        );
        fetchedResults.push(...chunkResults);
      }

      // Combine cached and fetched results
      const allResults = [...cachedResults, ...fetchedResults];

      // Sort to maintain original item order
      const idOrder = new Map(
        observationItems.map((item, i) => [item.node.id, i]),
      );
      allResults.sort(
        (a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0),
      );

      setData(allResults);
      setFailedObservationIds(failures);
      setIsLoading(false);
      return allResults;
    } catch {
      setIsError(true);
      setIsLoading(false);
      throw new Error("Failed to load observation data");
    }
  }, [items, traceId, projectId, utils, queryClient]);

  return {
    /** Cached/loaded data (null if not yet loaded) */
    data,
    /** Whether data is currently being loaded */
    isLoading,
    /** Whether an error occurred during loading */
    isError,
    /** IDs of observations that failed to load */
    failedObservationIds,
    /** Trigger loading all observation I/O data */
    loadAllData,
    /** Build data from tree + cache without fetching (for virtualized mode) */
    buildDataFromCache,
    /** Total number of observations */
    totalCount: items.filter((item) => item.node.type !== "TRACE").length,
  };
}
