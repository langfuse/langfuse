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
 * - Graceful fallback: parses on this thread whenever the worker cannot
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cheapHash } from "@/src/hooks/parsedIoCacheKey";
import { parseIoOffThread } from "@/src/workers/jsonParserWorkerClient";

interface UseParsedTraceParams {
  traceId: string;
  input: unknown;
  output: unknown;
  metadata: unknown;
}

export function useParsedTrace({
  traceId,
  input,
  output,
  metadata,
}: UseParsedTraceParams) {
  // Per-field cache signatures: content-sensitive but never a whole-payload
  // stringify. Memoized on the raw reference (react-query structural sharing
  // keeps it referentially stable between renders), so each O(n) hash runs
  // only when that field actually changes — the exact moment a re-parse is
  // wanted — instead of the multi-MB re-serialization the old raw-value key
  // forced on every render.
  const inputSig = useMemo(() => cheapHash(input), [input]);
  const outputSig = useMemo(() => cheapHash(output), [output]);
  const metadataSig = useMemo(() => cheapHash(metadata), [metadata]);

  // Parse the data in Web Worker (React Query caches this)
  const parseQuery = useQuery({
    queryKey: ["parsed-trace", traceId, inputSig, outputSig, metadataSig],
    queryFn: async () =>
      parseIoOffThread({ source: "useParsedTrace", input, output, metadata }),
    enabled: !!(input || output || metadata), // Only run if we have data
    staleTime: Infinity, // Parsed data never goes stale (input data is the source of truth)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes after unmount
    meta: { toastOperation: "trace.parse" },
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
