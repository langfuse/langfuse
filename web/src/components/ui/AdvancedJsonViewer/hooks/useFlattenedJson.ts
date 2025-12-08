/**
 * useFlattenedJson - Flattens JSON data in background
 *
 * This hook uses Web Worker-based JSON flattening to prevent blocking the main
 * thread when processing large JSON structures during expand/collapse operations.
 *
 * Benefits:
 * - Non-blocking: Flattening happens in Web Worker
 * - Cached: React Query caches flattened data by expansion state
 * - Progressive: UI renders immediately, data populates when ready
 * - Graceful fallback: Uses sync flattening if Web Workers unavailable
 */

import { useQuery } from "@tanstack/react-query";
import { flattenJSON, calculateTotalLineCount } from "../utils/flattenJson";
import type { FlatJSONRow, ExpansionState, FlattenConfig } from "../types";
import type {
  FlattenRequest,
  FlattenResponse,
} from "@/src/workers/flatten-json.worker";

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
 * Flatten JSON data in Web Worker (or fallback to sync)
 * Returns a promise that resolves with flattened data
 */
async function flattenJsonData(
  data: unknown,
  expansionState: ExpansionState,
  config?: FlattenConfig,
): Promise<FlattenedData> {
  const worker = getOrCreateWorker();

  // Fallback to sync flattening if no worker support
  if (!worker) {
    console.log(
      "[useFlattenedJson] Web Worker not available, using sync flattening",
    );

    const startTime = performance.now();

    return {
      flatRows: flattenJSON(data, expansionState, config),
      totalLineCount: calculateTotalLineCount(data),
      flattenTime: performance.now() - startTime,
    };
  }

  // Flatten in Web Worker (non-blocking)
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
  // Generate stable cache key from expansion state
  const expansionKey = generateExpansionKey(expansionState);

  // Flatten the data in Web Worker (React Query caches this)
  const flattenQuery = useQuery({
    queryKey: [
      "flattened-json",
      // Use data reference for cache invalidation
      data,
      // Use stable expansion key instead of full state object
      expansionKey,
      // Include config
      config?.rootKey,
      config?.maxDepth,
      config?.maxRows,
    ],
    queryFn: async () => {
      return flattenJsonData(data, expansionState, config);
    },
    enabled: data !== undefined && data !== null, // Only run if we have data
    staleTime: Infinity, // Flattened data never goes stale (data + expansionState is the source of truth)
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes after unmount
  });

  return {
    // Flattened data (cached by React Query)
    flatRows: flattenQuery.data?.flatRows ?? [],
    totalLineCount: flattenQuery.data?.totalLineCount ?? 0,

    // Loading states
    isFlattening: flattenQuery.isLoading,
    isReady: !flattenQuery.isLoading && flattenQuery.data !== undefined,

    // Debug info
    flattenTime: flattenQuery.data?.flattenTime,
    flattenError: flattenQuery.error?.message,
  };
}
