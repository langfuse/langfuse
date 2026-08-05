import { useMemo } from "react";
import { useCorrectionCache } from "@/src/features/corrections/contexts/CorrectionCacheContext";
import { type ScoreDomain } from "@langfuse/shared";

/**
 * Merges cached correction with server data
 * Cache takes precedence for optimistic updates (includes full value)
 * Falls back to server data when cache is empty
 */
export function useCorrectionData(
  existingCorrection: ScoreDomain | null | undefined,
  observationId: string | undefined,
  traceId: string,
) {
  const correctionCache = useCorrectionCache();

  // Get cached correction - for observation or trace level
  // NOTE: getForObservation/getForTrace filter out deleted items
  const cachedMeta = useMemo(() => {
    if (observationId) {
      return correctionCache.getForObservation(traceId, observationId);
    }
    return correctionCache.getForTrace(traceId);
  }, [correctionCache, observationId, traceId]);

  // Merge: cache is source of truth, always prefer cache over server
  const effectiveCorrection = useMemo(() => {
    // 1. If cache exists (new/edited/being saved), use cache as source of truth
    if (cachedMeta) {
      return {
        ...existingCorrection,
        id: cachedMeta.id,
        timestamp: cachedMeta.timestamp,
        longStringValue: cachedMeta.value, // Use cached value for optimistic updates
      } as ScoreDomain;
    }

    // 2. If server correction is marked as deleted, return null
    if (
      existingCorrection?.id &&
      correctionCache.isDeleted(existingCorrection.id)
    ) {
      return null;
    }

    // 3. Otherwise, use server correction
    return existingCorrection;
  }, [cachedMeta, existingCorrection, correctionCache]);

  // Check if deleted - check server correction ID since that's what we delete
  const isDeleted = useMemo(() => {
    return existingCorrection?.id
      ? correctionCache.isDeleted(existingCorrection.id)
      : false;
  }, [existingCorrection?.id, correctionCache]);

  // Extract value - prefer cached value (optimistic) over server value
  const correctionValue = useMemo(() => {
    // If deleted, return empty string
    if (isDeleted) {
      return "";
    }
    // If we have cached value, use it (optimistic update)
    if (cachedMeta?.value !== undefined) {
      return cachedMeta.value;
    }
    // Otherwise use server value
    return existingCorrection?.longStringValue ?? "";
  }, [cachedMeta, existingCorrection, isDeleted]);

  return {
    effectiveCorrection,
    correctionValue,
  };
}
