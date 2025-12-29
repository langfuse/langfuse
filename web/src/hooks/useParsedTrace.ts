/**
 * useParsedTrace - Parses trace data in background
 *
 * This hook uses Web Worker-based JSON parsing to prevent blocking the main
 * thread when processing large trace I/O.
 *
 * Key differences from useParsedObservation:
 * - No data fetching (trace data already loaded)
 * - Only performs parsing step
 * - Lighter weight, focused on single responsibility
 *
 * Benefits:
 * - Non-blocking: Parsing happens in Web Worker
 * - Cached: React Query caches parsed data
 * - Progressive: UI renders immediately, data populates when ready
 * - Graceful fallback: Uses sync parsing if Web Workers unavailable
 */

import { useQuery } from "@tanstack/react-query";
import type {
  ParseRequest,
  ParseResponse,
} from "@/src/workers/json-parser.worker";

/**
 * Threshold for using Web Worker vs sync parsing (in characters).
 * Below this: sync parse (faster, no message-passing overhead)
 * Above this: Web Worker (non-blocking, prevents UI freeze)
 */
const PARSE_IN_WEBWORKER_THRESHOLD = 100_000; // 100KB

/**
 * Estimate the size of a value in characters (for threshold check)
 */
function estimateSize(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return value.length;
  // For objects/arrays, estimate via JSON stringification length
  // This is approximate but good enough for threshold decisions
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

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
        console.error("[useParsedTrace] Worker error:", error);
      };
    } catch (error) {
      console.error("[useParsedTrace] Failed to create worker:", error);
      return null;
    }
  }

  return workerInstance;
}

interface UseParsedTraceParams {
  traceId: string;
  input: unknown;
  output: unknown;
  metadata: unknown;
}

interface ParsedData {
  input: unknown;
  output: unknown;
  metadata: unknown;
  parseTime: number;
}

/**
 * Sync parse helper - used for small payloads or when Web Worker unavailable
 */
async function syncParseTraceData(
  input: unknown,
  output: unknown,
  metadata: unknown,
): Promise<ParsedData> {
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

/**
 * Parse trace data in Web Worker (or sync for small payloads)
 * Returns a promise that resolves with parsed data
 */
async function parseTraceData(
  input: unknown,
  output: unknown,
  metadata: unknown,
): Promise<ParsedData> {
  // Estimate total size to decide sync vs worker
  const totalSize =
    estimateSize(input) + estimateSize(output) + estimateSize(metadata);

  // Small payloads: sync parse (faster, no message-passing overhead)
  if (totalSize < PARSE_IN_WEBWORKER_THRESHOLD) {
    return syncParseTraceData(input, output, metadata);
  }

  const worker = getOrCreateWorker();

  // Fallback to sync parsing if no worker support
  if (!worker) {
    return syncParseTraceData(input, output, metadata);
  }

  // Large payloads: parse in Web Worker (non-blocking)
  return new Promise<ParsedData>((resolve, reject) => {
    const parseId = `${Date.now()}-${Math.random()}`;

    pendingCallbacks.set(parseId, (result) => {
      pendingCallbacks.delete(parseId);

      if (result.error) {
        console.error(`[useParsedTrace] Parse error: ${result.error}`);
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

export function useParsedTrace({
  traceId,
  input,
  output,
  metadata,
}: UseParsedTraceParams) {
  // Parse the data in Web Worker (React Query caches this)
  const parseQuery = useQuery({
    queryKey: [
      "parsed-trace",
      traceId,
      // Include data hash to detect changes
      input,
      output,
      metadata,
    ],
    queryFn: async () => {
      return parseTraceData(input, output, metadata);
    },
    enabled: !!(input || output || metadata), // Only run if we have data
    staleTime: Infinity, // Parsed data never goes stale (input data is the source of truth)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes after unmount
  });

  return {
    // Parsed data (cached by React Query)
    parsedInput: parseQuery.data?.input,
    parsedOutput: parseQuery.data?.output,
    parsedMetadata: parseQuery.data?.metadata,

    // Loading states
    isParsing: parseQuery.isLoading,
    isReady: !parseQuery.isLoading && parseQuery.data !== undefined,

    // Debug info
    parseTime: parseQuery.data?.parseTime,
    parseError: parseQuery.error?.message,
  };
}
