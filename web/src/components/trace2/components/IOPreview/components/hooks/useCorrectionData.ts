import { useMemo } from "react";
import { useCorrectionCache } from "@/src/features/corrections/contexts/CorrectionCacheContext";
import { type ScoreDomain } from "@langfuse/shared";
import { useTraceData } from "@/src/components/trace2/contexts/TraceDataContext";

/**
 * Merges cached correction metadata with server data
 * Cache takes precedence for existence/timestamp (optimistic updates)
 * Value always comes from server (not cached to avoid memory bloat)
 */
export function useCorrectionData(
  existingCorrection: ScoreDomain | null | undefined,
  observationId: string | undefined,
) {
  const correctionCache = useCorrectionCache();
  const { trace } = useTraceData();

  // Get cached correction metadata - for observation or trace level
  const cachedMeta = useMemo(() => {
    if (observationId) {
      return correctionCache.getForObservation(trace.id, observationId);
    }
    return correctionCache.getForTrace(trace.id);
  }, [correctionCache, observationId, trace.id]);

  // Merge: cache metadata takes precedence for existence/timestamp,
  // but value always comes from server (not cached)
  const effectiveCorrection = useMemo(() => {
    if (!cachedMeta) return existingCorrection;

    return {
      ...existingCorrection,
      id: cachedMeta.id,
      timestamp: cachedMeta.timestamp,
    } as ScoreDomain;
  }, [cachedMeta, existingCorrection]);

  // Check if deleted in cache
  const isDeleted = useMemo(() => {
    return effectiveCorrection?.id
      ? correctionCache.isDeleted(effectiveCorrection.id)
      : false;
  }, [effectiveCorrection?.id, correctionCache]);

  // Extract value from correction (always from server)
  const correctionValue = useMemo(() => {
    return effectiveCorrection?.longStringValue ?? "";
  }, [effectiveCorrection]);

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
