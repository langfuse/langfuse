/**
 * Hook for download and copy JSON functionality in LogView.
 *
 * Handles:
 * - Copy to clipboard (non-virtualized mode)
 * - Download as JSON file (both modes)
 * - Loading state management
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { stringify } from "@langfuse/shared";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { type ObservationIOData } from "./useLogViewAllObservationsIO";
import { useTranslations } from "next-intl";

export interface UseLogViewDownloadParams {
  /** Trace ID for filename */
  traceId: string;
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
 * Hook for managing download and copy JSON functionality.
 */
export function useLogViewDownload({
  traceId,
  isCacheOnly,
  allObservationsData,
  isLoadingAllData,
  failedObservationIds,
  loadAllData,
  buildDataFromCache,
}: UseLogViewDownloadParams) {
  const t = useTranslations("coreDetails.traces.logToolbar");
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Helper to download JSON data. Serializes through the shared stringify
  // helper (not the raw JSON.stringify) so \uXXXX escapes in string fields
  // (e.g. Japanese ingested with Python ensure_ascii=True) are decoded to
  // real characters, matching the server-side trace download route.
  const downloadJsonData = useCallback(
    (data: unknown) => {
      const blob = new Blob([stringify(data, undefined, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trace-${traceId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [traceId],
  );

  // Copy JSON handler - uses cache only or loads all based on threshold
  const handleCopyJson = useCallback(async () => {
    if (isCacheOnly) {
      // Cache-only mode: build from tree + cache (no fetching)
      setIsActionLoading(true);
      setTimeout(() => {
        try {
          const data = buildDataFromCache();
          copyTextToClipboard(stringify(data, undefined, 2));
          toast.success(t("copiedCacheOnly"));
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
            t("copiedMissingIo", { count: failedObservationIds.length }),
          );
        } else {
          toast.success(t("copied"));
        }
      } else {
        setIsActionLoading(true);
        try {
          const data = await loadAllData();
          copyTextToClipboard(stringify(data, undefined, 2));
          // Check for failures after loading
          if (failedObservationIds.length > 0) {
            toast.warning(
              t("copiedMissingIo", { count: failedObservationIds.length }),
            );
          } else {
            toast.success(t("copied"));
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
    t,
  ]);

  // Download JSON handler - uses cache only or loads all based on threshold
  const handleDownloadJson = useCallback(async () => {
    if (isCacheOnly) {
      // Cache-only mode: build from tree + cache (no fetching)
      setIsActionLoading(true);
      // Use setTimeout to allow spinner to render before potentially heavy operation
      setTimeout(() => {
        try {
          const data = buildDataFromCache();
          downloadJsonData(data);
          toast.success(t("downloadedCacheOnly"));
        } finally {
          setIsActionLoading(false);
        }
      }, 0);
    } else {
      // Load all mode: fetch all data if needed
      if (allObservationsData) {
        downloadJsonData(allObservationsData);
        // Show warning if some observations failed to load
        if (failedObservationIds.length > 0) {
          toast.warning(
            t("downloadedMissingIo", { count: failedObservationIds.length }),
          );
        } else {
          toast.success(t("downloaded"));
        }
      } else {
        setIsActionLoading(true);
        try {
          const data = await loadAllData();
          downloadJsonData(data);
          // Check for failures after loading
          if (failedObservationIds.length > 0) {
            toast.warning(
              t("downloadedMissingIo", { count: failedObservationIds.length }),
            );
          } else {
            toast.success(t("downloaded"));
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
    downloadJsonData,
    failedObservationIds,
    t,
  ]);

  return {
    handleCopyJson,
    handleDownloadJson,
    isActionLoading: isActionLoading || isLoadingAllData,
  };
}
