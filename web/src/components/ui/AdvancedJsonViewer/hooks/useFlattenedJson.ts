/**
 * useFlattenedJson - Flattens JSON data in background (for large datasets)
 *
 * This hook intelligently chooses between sync and Web Worker-based flattening
 * based on dataset size to optimize performance:
 * - Small datasets (≤100K nodes): Sync flattening (instant, no worker overhead)
 * - Large datasets (>100K nodes): Web Worker flattening (non-blocking)
 *
 * Benefits:
 * - Automatic threshold-based selection
 * - Non-blocking for large datasets: Flattening happens in Web Worker
 * - Instant for small datasets: No worker overhead or message serialization
 * - Cached: React Query caches flattened data by expansion state
 * - Graceful fallback: Uses sync flattening if Web Workers unavailable
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { flattenJSON, calculateTotalLineCount } from "../utils/flattenJson";
import type { FlatJSONRow, ExpansionState, FlattenConfig } from "../types";
import type {
  FlattenRequest,
  FlattenResponse,
} from "@/src/workers/flatten-json.worker";

// Size threshold for using Web Worker (nodes)
const WORKER_SIZE_THRESHOLD = 100_000;

// Singleton worker instance shared across all hook calls
let workerInstance: Worker | null = null;
const pendingCallbacks = new Map<
  string,
  (data: FlattenResponse & { error?: string }) => void
>();

function getOrCreateWorker(): Worker | null {
  if (typeof window === "undefined" || !window.Worker) {
    return null; // SSR or no Worker support
  }

  if (!workerInstance) {
    try {
      // Next.js will bundle this as a separate chunk
      workerInstance = new Worker(
        new URL("@/src/workers/flatten-json.worker.ts", import.meta.url),
      );

      workerInstance.onmessage = (e: MessageEvent<FlattenResponse>) => {
        const callback = pendingCallbacks.get(e.data.id);
        if (callback) {
          callback(e.data);
          pendingCallbacks.delete(e.data.id);
        }
      };

      workerInstance.onerror = (error) => {
        console.error("[useFlattenedJson] Worker error:", error);
      };
    } catch (error) {
      console.error("[useFlattenedJson] Failed to create worker:", error);
      return null;
    }
  }

  return workerInstance;
}

interface UseFlattenedJsonParams {
  data: unknown;
  expansionState: ExpansionState;
  config?: FlattenConfig;
}

interface FlattenedData {
  flatRows: FlatJSONRow[];
  totalLineCount: number;
  flattenTime: number;
}

/**
 * Generate a stable cache key from expansion state
 * Handles both boolean and Record<string, boolean> expansion states
 */
function generateExpansionKey(expansionState: ExpansionState): string {
  if (typeof expansionState === "boolean") {
    return expansionState ? "all-expanded" : "all-collapsed";
  }

  // Sort keys for stable cache key
  const sortedEntries = Object.entries(expansionState).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  // Only include collapsed paths (default is expanded)
  const collapsedPaths = sortedEntries
    .filter(([_, isExpanded]) => !isExpanded)
    .map(([path]) => path);

  return collapsedPaths.length === 0
    ? "all-expanded"
    : collapsedPaths.join(",");
}

/**
 * Flatten JSON data - uses Web Worker for large datasets, sync for small ones
 * Returns a promise that resolves with flattened data
 */
async function flattenJsonData(
  data: unknown,
  expansionState: ExpansionState,
  config: FlattenConfig | undefined,
  dataSize: number,
): Promise<FlattenedData> {
  const startTime = performance.now();

  // Use sync flattening for small datasets (no worker overhead)
  if (dataSize <= WORKER_SIZE_THRESHOLD) {
    console.log(
      `[useFlattenedJson] Small dataset (${dataSize} nodes), using sync flattening`,
    );

    return {
      flatRows: flattenJSON(data, expansionState, config),
      totalLineCount: dataSize,
      flattenTime: performance.now() - startTime,
    };
  }

  // Use Web Worker for large datasets (non-blocking)
  const worker = getOrCreateWorker();

  // Fallback to sync flattening if no worker support
  if (!worker) {
    console.log(
      "[useFlattenedJson] Web Worker not available, using sync flattening",
    );

    return {
      flatRows: flattenJSON(data, expansionState, config),
      totalLineCount: dataSize,
      flattenTime: performance.now() - startTime,
    };
  }

  // Flatten in Web Worker (non-blocking)
  console.log(
    `[useFlattenedJson] Large dataset (${dataSize} nodes), using Web Worker`,
  );

  return new Promise<FlattenedData>((resolve, reject) => {
    const flattenId = `${Date.now()}-${Math.random()}`;

    console.log(`[useFlattenedJson] Starting background flatten ${flattenId}`);

    pendingCallbacks.set(flattenId, (result) => {
      pendingCallbacks.delete(flattenId);

      if (result.error) {
        console.error(`[useFlattenedJson] Flatten error: ${result.error}`);
        reject(new Error(result.error));
        return;
      }

      console.log(
        `[useFlattenedJson] Flatten completed in ${result.flattenTime?.toFixed(2)}ms`,
      );

      resolve({
        flatRows: result.flatRows,
        totalLineCount: result.totalLineCount,
        flattenTime: result.flattenTime ?? 0,
      });
    });

    const request: FlattenRequest = {
      id: flattenId,
      data,
      expansionState,
      config,
    };

    worker.postMessage(request);
  });
}

export function useFlattenedJson({
  data,
  expansionState,
  config,
}: UseFlattenedJsonParams) {
  // Calculate data size once (cached by data reference)
  const dataSize = useMemo(() => {
    if (data === undefined || data === null) return 0;
    return calculateTotalLineCount(data);
  }, [data]);

  // For small datasets, use direct useMemo (truly synchronous, no loading states)
  const syncFlattenedData = useMemo(() => {
    if (dataSize > WORKER_SIZE_THRESHOLD) return null; // Don't compute for large datasets

    console.log(
      `[useFlattenedJson] Small dataset (${dataSize} nodes), using sync useMemo`,
    );

    const startTime = performance.now();
    const flatRows = flattenJSON(data, expansionState, config);
    const flattenTime = performance.now() - startTime;

    console.log(
      `[useFlattenedJson] Sync flatten completed in ${flattenTime.toFixed(2)}ms`,
    );

    return {
      flatRows,
      totalLineCount: dataSize,
      flattenTime,
    };
  }, [data, expansionState, config, dataSize]);

  // Generate stable cache key from expansion state (only for large datasets)
  const expansionKey = generateExpansionKey(expansionState);

  // For large datasets, use React Query + Web Worker (async, non-blocking)
  const asyncFlattenQuery = useQuery({
    queryKey: [
      "flattened-json",
      data,
      expansionKey,
      config?.rootKey,
      config?.maxDepth,
      config?.maxRows,
    ],
    queryFn: async () => {
      return flattenJsonData(data, expansionState, config, dataSize);
    },
    enabled:
      data !== undefined && data !== null && dataSize > WORKER_SIZE_THRESHOLD, // Only run for large datasets
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });

  // Return sync data for small datasets, async data for large datasets
  if (dataSize <= WORKER_SIZE_THRESHOLD) {
    return {
      flatRows: syncFlattenedData?.flatRows ?? [],
      totalLineCount: syncFlattenedData?.totalLineCount ?? dataSize,
      isFlattening: false, // Sync computation never has loading state
      isReady: syncFlattenedData !== null,
      flattenTime: syncFlattenedData?.flattenTime,
      flattenError: undefined,
    };
  }

  return {
    flatRows: asyncFlattenQuery.data?.flatRows ?? [],
    totalLineCount: asyncFlattenQuery.data?.totalLineCount ?? dataSize,
    isFlattening: asyncFlattenQuery.isLoading,
    isReady:
      !asyncFlattenQuery.isLoading && asyncFlattenQuery.data !== undefined,
    flattenTime: asyncFlattenQuery.data?.flattenTime,
    flattenError: asyncFlattenQuery.error?.message,
  };
}
