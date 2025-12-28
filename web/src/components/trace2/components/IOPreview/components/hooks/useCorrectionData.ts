import { useMemo } from "react";
import { useCorrectionCache } from "@/src/features/corrections/contexts/CorrectionCacheContext";
import { type ScoreDomain } from "@langfuse/shared";
import { useTraceData } from "@/src/components/trace2/contexts/TraceDataContext";

/**
 * Merges cached correction with server data
 * Cache takes precedence for optimistic updates (includes full value)
 * Falls back to server data when cache is empty
 */
export function useCorrectionData(
  existingCorrection: ScoreDomain | null | undefined,
  observationId: string | undefined,
) {
  const correctionCache = useCorrectionCache();
  const { trace } = useTraceData();

  // Get cached correction - for observation or trace level
  const cachedMeta = useMemo(() => {
    if (observationId) {
      return correctionCache.getForObservation(trace.id, observationId);
    }
    return correctionCache.getForTrace(trace.id);
  }, [correctionCache, observationId, trace.id]);

  // Merge: cache takes precedence for optimistic updates
  const effectiveCorrection = useMemo(() => {
    if (!cachedMeta) return existingCorrection;

    return {
      ...existingCorrection,
      id: cachedMeta.id,
      timestamp: cachedMeta.timestamp,
      longStringValue: cachedMeta.value, // Use cached value for optimistic updates
    } as ScoreDomain;
  }, [cachedMeta, existingCorrection]);

  // Check if deleted in cache
  const isDeleted = useMemo(() => {
    return effectiveCorrection?.id
      ? correctionCache.isDeleted(effectiveCorrection.id)
      : false;
  }, [effectiveCorrection?.id, correctionCache]);

  // Extract value - prefer cached value (optimistic) over server value
  const correctionValue = useMemo(() => {
    // If we have cached value, use it (optimistic update)
    if (cachedMeta?.value !== undefined) {
      return cachedMeta.value;
    }
    // Otherwise use server value
    return existingCorrection?.longStringValue ?? "";
  }, [cachedMeta, existingCorrection]);

  // Check if save is in progress
  const isSaving = useMemo(() => {
    return cachedMeta?.isSaving ?? false;
  }, [cachedMeta]);

  return {
    effectiveCorrection,
    isDeleted,
    correctionValue,
    isSaving,
  };
}
