import { useMemo } from "react";
import { useCorrectionCache } from "@/src/features/corrections/contexts/CorrectionCacheContext";
import { type ScoreDomain } from "@langfuse/shared";

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

  // Get cached correction metadata
  const cachedMeta = useMemo(() => {
    return observationId
      ? correctionCache.getForObservation(observationId)
      : undefined;
  }, [correctionCache, observationId]);

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

  // Extract value from correction
  const correctionValue = useMemo(() => {
    if (!effectiveCorrection?.longStringValue) return "";
    return effectiveCorrection.longStringValue;
  }, [effectiveCorrection]);

  return {
    effectiveCorrection,
    isDeleted,
    correctionValue,
  };
}
