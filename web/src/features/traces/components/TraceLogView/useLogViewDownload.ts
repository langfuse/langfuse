/**
 * Hook for copy JSON functionality in LogView.
 *
 * Handles:
 * - Copy to clipboard (non-virtualized mode)
 * - Loading state management
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { stringify } from "@langfuse/shared";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { type ObservationIOData } from "./useLogViewAllObservationsIO";

export interface UseLogViewDownloadParams {
  /** Whether to use cached I/O only (vs loading all data) */
  isCacheOnly: boolean;
  /** Already loaded observation data (null if not loaded) */
  allObservationsData: ObservationIOData[] | null;
  /** Whether data is being loaded by useLogViewAllObservationsIO */
  isLoadingAllData: boolean;
  /** IDs of observations that failed to load */
  failedObservationIds: string[];
  /** Load all observation data (uses cache where available) */
  loadAllData: () => Promise<ObservationIOData[]>;
  /** Build data from tree + cache without fetching (for cache-only mode) */
  buildDataFromCache: () => ObservationIOData[];
}

/**
 * Hook for managing copy JSON functionality.
 */
export function useLogViewDownload({
  isCacheOnly,
  allObservationsData,
  isLoadingAllData,
  failedObservationIds,
  loadAllData,
  buildDataFromCache,
}: UseLogViewDownloadParams) {
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Copy JSON handler - uses cache only or loads all based on threshold.
  // Serializes through the shared stringify helper (not the raw
  // JSON.stringify) so \uXXXX escapes in string fields (e.g. Japanese
  // ingested with Python ensure_ascii=True) are decoded to real characters,
  // matching the server-side trace download route.
  const handleCopyJson = useCallback(async () => {
    if (isCacheOnly) {
      // Cache-only mode: build from tree + cache (no fetching)
      setIsActionLoading(true);
      setTimeout(() => {
        try {
          const data = buildDataFromCache();
          copyTextToClipboard(stringify(data, undefined, 2));
          toast.success("Copied to clipboard (cache only)");
        } finally {
          setIsActionLoading(false);
        }
      }, 0);
    } else {
      // Load all mode: fetch all data if needed
      if (allObservationsData) {
        copyTextToClipboard(stringify(allObservationsData, undefined, 2));
        // Show warning if some observations failed to load
        if (failedObservationIds.length > 0) {
          toast.warning(
            `Copied to clipboard. ${failedObservationIds.length} observation${failedObservationIds.length === 1 ? "" : "s"} failed to load and ${failedObservationIds.length === 1 ? "is" : "are"} missing I/O data.`,
          );
        } else {
          toast.success("Copied to clipboard");
        }
      } else {
        setIsActionLoading(true);
        try {
          const data = await loadAllData();
          copyTextToClipboard(stringify(data, undefined, 2));
          // Check for failures after loading
          if (failedObservationIds.length > 0) {
            toast.warning(
              `Copied to clipboard. ${failedObservationIds.length} observation${failedObservationIds.length === 1 ? "" : "s"} failed to load and ${failedObservationIds.length === 1 ? "is" : "are"} missing I/O data.`,
            );
          } else {
            toast.success("Copied to clipboard");
          }
        } finally {
          setIsActionLoading(false);
        }
      }
    }
  }, [
    isCacheOnly,
    allObservationsData,
    loadAllData,
    buildDataFromCache,
    failedObservationIds,
  ]);

  return {
    handleCopyJson,
    isActionLoading: isActionLoading || isLoadingAllData,
  };
}
