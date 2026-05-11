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
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { type ObservationIOData } from "./useLogViewAllObservationsIO";

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
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Helper to download JSON data
  const downloadJsonData = useCallback(
    (data: unknown) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
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
          void copyTextToClipboard(JSON.stringify(data, null, 2));
          toast.success("Copied to clipboard (cache only)");
        } finally {
          setIsActionLoading(false);
        }
      }, 0);
    } else {
      // Load all mode: fetch all data if needed
      if (allObservationsData) {
        void copyTextToClipboard(JSON.stringify(allObservationsData, null, 2));
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
          void copyTextToClipboard(JSON.stringify(data, null, 2));
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
          toast.success("Downloaded trace data (cache only)");
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
            `Downloaded trace data. ${failedObservationIds.length} observation${failedObservationIds.length === 1 ? "" : "s"} failed to load and ${failedObservationIds.length === 1 ? "is" : "are"} missing I/O data.`,
          );
        } else {
          toast.success("Downloaded trace data");
        }
      } else {
        setIsActionLoading(true);
        try {
          const data = await loadAllData();
          downloadJsonData(data);
          // Check for failures after loading
          if (failedObservationIds.length > 0) {
            toast.warning(
              `Downloaded trace data. ${failedObservationIds.length} observation${failedObservationIds.length === 1 ? "" : "s"} failed to load and ${failedObservationIds.length === 1 ? "is" : "are"} missing I/O data.`,
            );
          } else {
            toast.success("Downloaded trace data");
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
  ]);

  return {
    handleCopyJson,
    handleDownloadJson,
    isActionLoading: isActionLoading || isLoadingAllData,
  };
}
