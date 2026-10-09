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
 * - Graceful fallback: parses on this thread whenever the worker cannot
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo, useEffect } from "react";
import { api, sendAsPostOption } from "@/src/utils/api";
import { useReadPath } from "@/src/features/events";
import type { EventBatchIOOutput } from "@/src/features/events/server";
import {
  type ObservationReturnTypeWithMetadata,
  type ObservationReturnType,
} from "@/src/server/api/routers/traces";
import { stringifyMetadata } from "@/src/utils/clientSideDomainTypes";
import { cheapHash } from "@/src/hooks/parsedIoCacheKey";
import { parseIoOffThread } from "@/src/workers/jsonParserWorkerClient";

type ObservationWithStringifiedIO = ObservationReturnTypeWithMetadata & {
  input: string | null;
  output: string | null;
};

type ParsedObservationResult =
  | ObservationWithStringifiedIO
  | EventBatchIOOutput
  | undefined;

interface UseParsedObservationParams {
  observationId: string;
  traceId: string;
  projectId: string;
  startTime?: Date;
  // Base observation to merge IO data into (for events path when beta ON)
  baseObservation?: ObservationReturnType | ObservationReturnTypeWithMetadata;
}

export function useParsedObservation({
  observationId,
  traceId,
  projectId,
  startTime,
  baseObservation,
}: UseParsedObservationParams) {
  const { isV4 } = useReadPath();

  // Step 1a: Fetch raw observation data from observations table (beta OFF)
  const observationQuery = api.observations.byId.useQuery(
    {
      observationId,
      traceId,
      projectId,
      startTime,
    },
    {
      enabled: !isV4,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  );

  // Step 1b: Fetch raw observation data from events table (beta ON)
  const eventsQuery = api.events.batchIO.useQuery(
    {
      projectId,
      traceId,
      observations: [{ id: observationId, traceId }],
      minStartTime: startTime ?? new Date(0),
      maxStartTime: startTime ?? new Date(),
      truncated: false,
    },
    {
      ...sendAsPostOption,
      enabled: isV4,
      staleTime: 5 * 60 * 1000, // 5 minutes
      select: (data) => data[0], // Extract single result from batch
    },
  );

  const mergedObservation = useMemo<ParsedObservationResult>(() => {
    if (isV4) {
      if (baseObservation && eventsQuery.data) {
        return {
          ...baseObservation,
          input: eventsQuery.data.input,
          output: eventsQuery.data.output,
          // Stringify metadata to match ObservationReturnTypeWithMetadata format
          metadata: stringifyMetadata(eventsQuery.data.metadata),
        } satisfies ObservationWithStringifiedIO;
      }
      // No base observation provided: return partial events data with safe stringified I/O.
      return eventsQuery.data;
    }
    // Beta OFF: return full observation from observations table
    return observationQuery.data;
  }, [isV4, baseObservation, eventsQuery.data, observationQuery.data]);

  // TODO: remove when going into prod
  // Log warning if baseObservation missing when beta ON (helps catch issues in testing)
  useEffect(() => {
    if (isV4 && eventsQuery.data && !baseObservation) {
      console.warn(
        "[useParsedObservation] baseObservation missing - JumpToPlaygroundButton may not work correctly",
        { observationId },
      );
    }
  }, [isV4, eventsQuery.data, baseObservation, observationId]);

  const isLoadingRaw = isV4
    ? eventsQuery.isLoading
    : observationQuery.isLoading;

  // Per-field cache signatures: content-sensitive but never a whole-payload
  // stringify. Memoized on the raw reference (react-query structural sharing
  // keeps it referentially stable between renders), so each O(n) hash runs
  // only when that field actually changes — the exact moment a re-parse is
  // wanted — instead of the multi-MB re-serialization the old raw-value key
  // forced on every render.
  const inputSig = useMemo(
    () => cheapHash(mergedObservation?.input),
    [mergedObservation?.input],
  );
  const outputSig = useMemo(
    () => cheapHash(mergedObservation?.output),
    [mergedObservation?.output],
  );
  const metadataSig = useMemo(
    () => cheapHash(mergedObservation?.metadata),
    [mergedObservation?.metadata],
  );

  // Step 2: Parse the data in Web Worker (React Query caches THIS too!)
  const parseQuery = useQuery({
    queryKey: [
      "parsed-observation",
      observationId,
      inputSig,
      outputSig,
      metadataSig,
    ],
    queryFn: async () => {
      if (!mergedObservation) {
        throw new Error("No observation data to parse");
      }

      return parseIoOffThread({
        source: "useParsedObservation",
        input: mergedObservation.input,
        output: mergedObservation.output,
        metadata: mergedObservation.metadata,
      });
    },
    enabled: !!mergedObservation, // Only run when we have data
    staleTime: Infinity, // Parsed data never goes stale (input data is the source of truth)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes after unmount
    meta: { toastOperation: "observation.parse" },
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
