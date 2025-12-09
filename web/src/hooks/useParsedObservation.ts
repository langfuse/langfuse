/**
 * useParsedObservation - Fetches and parses observation data in background
 *
 * This hook combines tRPC data fetching with Web Worker-based JSON parsing
 * to prevent blocking the main thread when processing large observation I/O.
 *
 * Benefits:
 * - Non-blocking: Parsing happens in Web Worker
 * - Cached: React Query caches both raw data AND parsed data independently
 * - Progressive: UI renders immediately, data populates when ready
 * - Graceful fallback: Uses sync parsing if Web Workers unavailable
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/utils/api";
import type {
  ParseRequest,
  ParseResponse,
} from "@/src/workers/json-parser.worker";

// Singleton worker instance shared across all hook calls
let workerInstance: Worker | null = null;
const pendingCallbacks = new Map<
  string,
  (data: ParseResponse & { error?: string }) => void
>();

function getOrCreateWorker(): Worker | null {
  if (typeof window === "undefined" || !window.Worker) {
    return null; // SSR or no Worker support
  }

  if (!workerInstance) {
    try {
      // Next.js will bundle this as a separate chunk
      workerInstance = new Worker(
        new URL("@/src/workers/json-parser.worker.ts", import.meta.url),
      );

      workerInstance.onmessage = (e: MessageEvent<ParseResponse>) => {
        const callback = pendingCallbacks.get(e.data.id);
        if (callback) {
          callback(e.data);
          pendingCallbacks.delete(e.data.id);
        }
      };

      workerInstance.onerror = (error) => {
        console.error("[useParsedObservation] Worker error:", error);
      };
    } catch (error) {
      console.error("[useParsedObservation] Failed to create worker:", error);
      return null;
    }
  }

  return workerInstance;
}

interface UseParsedObservationParams {
  observationId: string;
  traceId: string;
  projectId: string;
  startTime?: Date;
}

interface ParsedData {
  input: unknown;
  output: unknown;
  metadata: unknown;
  parseTime: number;
}

/**
 * Parse observation data in Web Worker (or fallback to sync)
 * Returns a promise that resolves with parsed data
 */
async function parseObservationData(
  input: unknown,
  output: unknown,
  metadata: unknown,
): Promise<ParsedData> {
  const worker = getOrCreateWorker();

  // Fallback to sync parsing if no worker support
  if (!worker) {
    const { deepParseJsonIterative } = await import("@langfuse/shared");
    const startTime = performance.now();

    return {
      input: deepParseJsonIterative(input, {
        maxDepth: 50,
        maxSize: 500_000,
      }),
      output: deepParseJsonIterative(output, {
        maxDepth: 50,
        maxSize: 500_000,
      }),
      metadata: deepParseJsonIterative(metadata, {
        maxDepth: 50,
        maxSize: 500_000,
      }),
      parseTime: performance.now() - startTime,
    };
  }

  // Parse in Web Worker (non-blocking)
  return new Promise<ParsedData>((resolve, reject) => {
    const parseId = `${Date.now()}-${Math.random()}`;

    pendingCallbacks.set(parseId, (result) => {
      pendingCallbacks.delete(parseId);

      if (result.error) {
        console.error(`[useParsedObservation] Parse error: ${result.error}`);
        reject(new Error(result.error));
        return;
      }

      resolve({
        input: result.parsedInput,
        output: result.parsedOutput,
        metadata: result.parsedMetadata,
        parseTime: result.parseTime ?? 0,
      });
    });

    const request: ParseRequest = {
      id: parseId,
      input,
      output,
      metadata,
    };

    worker.postMessage(request);
  });
}

export function useParsedObservation({
  observationId,
  traceId,
  projectId,
  startTime,
}: UseParsedObservationParams) {
  // Step 1: Fetch raw observation data via tRPC (React Query caches this)
  const observationQuery = api.observations.byId.useQuery(
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

  // Step 2: Parse the data in Web Worker (React Query caches THIS too!)
  const parseQuery = useQuery({
    queryKey: [
      "parsed-observation",
      observationId,
      // Include data hash to detect changes
      observationQuery.data?.input,
      observationQuery.data?.output,
      observationQuery.data?.metadata,
    ],
    queryFn: async () => {
      if (!observationQuery.data) {
        throw new Error("No observation data to parse");
      }

      return parseObservationData(
        observationQuery.data.input,
        observationQuery.data.output,
        observationQuery.data.metadata,
      );
    },
    enabled: !!observationQuery.data, // Only run when we have data
    staleTime: Infinity, // Parsed data never goes stale (input data is the source of truth)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes after unmount
  });

  return {
    // Original observation data (cached by tRPC/React Query)
    observation: observationQuery.data,

    // Parsed data (cached by React Query)
    parsedInput: parseQuery.data?.input,
    parsedOutput: parseQuery.data?.output,
    parsedMetadata: parseQuery.data?.metadata,

    // Loading states
    isLoadingObservation: observationQuery.isLoading,
    isParsing: parseQuery.isLoading,
    isReady:
      !observationQuery.isLoading &&
      !parseQuery.isLoading &&
      parseQuery.data !== undefined,

    // Debug info
    parseTime: parseQuery.data?.parseTime,
    parseError: parseQuery.error?.message,
  };
}
