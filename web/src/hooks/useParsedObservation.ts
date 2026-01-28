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
import { useMemo, useEffect } from "react";
import { api } from "@/src/utils/api";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import {
  type ObservationReturnTypeWithMetadata,
  type ObservationReturnType,
} from "@/src/server/api/routers/traces";
import { stringifyMetadata } from "@/src/utils/clientSideDomainTypes";
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
  // Base observation to merge IO data into (for events path when beta ON)
  baseObservation?: ObservationReturnType | ObservationReturnTypeWithMetadata;
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
async function syncParseObservationData(
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
 * Parse observation data in Web Worker (or sync for small payloads)
 * Returns a promise that resolves with parsed data
 */
async function parseObservationData(
  input: unknown,
  output: unknown,
  metadata: unknown,
): Promise<ParsedData> {
  // Estimate total size to decide sync vs worker
  const totalSize =
    estimateSize(input) + estimateSize(output) + estimateSize(metadata);

  // Small payloads: sync parse (faster, no message-passing overhead)
  if (totalSize < PARSE_IN_WEBWORKER_THRESHOLD) {
    return syncParseObservationData(input, output, metadata);
  }

  const worker = getOrCreateWorker();

  // Fallback to sync parsing if no worker support
  if (!worker) {
    return syncParseObservationData(input, output, metadata);
  }

  // Large payloads: parse in Web Worker (non-blocking)
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
  baseObservation,
}: UseParsedObservationParams) {
  const { isBetaEnabled } = useV4Beta();

  // Step 1a: Fetch raw observation data from observations table (beta OFF)
  const observationQuery = api.observations.byId.useQuery(
    {
      observationId,
      traceId,
      projectId,
      startTime,
    },
    {
      enabled: !isBetaEnabled,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  );

  // Step 1b: Fetch raw observation data from events table (beta ON)
  const eventsQuery = api.events.batchIO.useQuery(
    {
      projectId,
      observations: [{ id: observationId, traceId }],
      minStartTime: startTime ?? new Date(0),
      maxStartTime: startTime ?? new Date(),
      truncated: false,
    },
    {
      enabled: isBetaEnabled,
      staleTime: 5 * 60 * 1000, // 5 minutes
      select: (data) => data[0], // Extract single result from batch
    },
  );

  const mergedObservation = useMemo(() => {
    if (isBetaEnabled) {
      if (baseObservation && eventsQuery.data) {
        return {
          ...baseObservation,
          input: eventsQuery.data.input as string,
          output: eventsQuery.data.output as string,
          // Stringify metadata to match ObservationReturnTypeWithMetadata format
          metadata: stringifyMetadata(eventsQuery.data.metadata),
        };
      }
      // No base observation provided: return events data as-is (incomplete type)
      return eventsQuery.data;
    }
    // Beta OFF: return full observation from observations table
    return observationQuery.data;
  }, [isBetaEnabled, baseObservation, eventsQuery.data, observationQuery.data]);

  // TODO: remove when going into prod
  // Log warning if baseObservation missing when beta ON (helps catch issues in testing)
  useEffect(() => {
    if (isBetaEnabled && eventsQuery.data && !baseObservation) {
      console.warn(
        "[useParsedObservation] baseObservation missing - JumpToPlaygroundButton may not work correctly",
        { observationId },
      );
    }
  }, [isBetaEnabled, eventsQuery.data, baseObservation, observationId]);

  const isLoadingRaw = isBetaEnabled
    ? eventsQuery.isLoading
    : observationQuery.isLoading;

  // Step 2: Parse the data in Web Worker (React Query caches THIS too!)
  const parseQuery = useQuery({
    queryKey: [
      "parsed-observation",
      observationId,
      // Include data hash to detect changes
      mergedObservation?.input,
      mergedObservation?.output,
      mergedObservation?.metadata,
    ],
    queryFn: async () => {
      if (!mergedObservation) {
        throw new Error("No observation data to parse");
      }

      return parseObservationData(
        mergedObservation.input,
        mergedObservation.output,
        mergedObservation.metadata,
      );
    },
    enabled: !!mergedObservation, // Only run when we have data
    staleTime: Infinity, // Parsed data never goes stale (input data is the source of truth)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes after unmount
  });

  return {
    // Observation data (merged with base when beta ON, or from observations table when beta OFF)
    observation: mergedObservation,

    // Parsed data (cached by React Query)
    parsedInput: parseQuery.data?.input,
    parsedOutput: parseQuery.data?.output,
    parsedMetadata: parseQuery.data?.metadata,

    // Loading states
    isLoadingObservation: isLoadingRaw,
    isParsing: parseQuery.isLoading,
    isReady:
      !isLoadingRaw && !parseQuery.isLoading && parseQuery.data !== undefined,
    // True when we have observation data but parsing hasn't completed yet
    isWaitingForParsing:
      !!mergedObservation &&
      (parseQuery.isLoading || parseQuery.data === undefined),

    // Debug info
    parseTime: parseQuery.data?.parseTime,
    parseError: parseQuery.error?.message,
  };
}
