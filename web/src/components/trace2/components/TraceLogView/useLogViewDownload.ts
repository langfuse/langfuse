/**
 * Hook for download and copy JSON functionality in LogView.
 *
 * Handles:
 * - Copy to clipboard (non-virtualized mode)
 * - Download as JSON file (both modes)
 * - Loading state management
 */

import { useState, useCallback } from "react";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { type ObservationIOData } from "./useLogViewAllObservationsIO";

export interface UseLogViewDownloadParams {
  /** Trace ID for filename */
  traceId: string;
  /** Whether virtualization is enabled */
  isVirtualized: boolean;
  /** Already loaded observation data (null if not loaded) */
  allObservationsData: ObservationIOData[] | null;
  /** Whether data is being loaded by useLogViewAllObservationsIO */
  isLoadingAllData: boolean;
  /** Load all observation data (uses cache where available) */
  loadAllData: () => Promise<ObservationIOData[]>;
  /** Build data from tree + cache without fetching (for virtualized mode) */
  buildDataFromCache: () => ObservationIOData[];
}

export interface UseLogViewDownloadReturn {
  /** Copy JSON to clipboard handler (returns undefined for virtualized mode) */
  handleCopyJson: (() => Promise<void>) | undefined;
  /** Download JSON file handler */
  handleDownloadJson: () => Promise<void>;
  /** Whether download/copy operation is in progress */
  isDownloadOrCopyLoading: boolean;
}

/**
 * Hook for managing download and copy JSON functionality.
 */
export function useLogViewDownload({
  traceId,
  isVirtualized,
  allObservationsData,
  isLoadingAllData,
  loadAllData,
  buildDataFromCache,
}: UseLogViewDownloadParams): UseLogViewDownloadReturn {
  // Track if we're actively loading for download
  const [isDownloadLoading, setIsDownloadLoading] = useState(false);

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

  // Copy JSON handler (non-virtualized mode only)
  const handleCopyJson = useCallback(async () => {
    if (allObservationsData) {
      // Data already loaded, copy immediately
      void copyTextToClipboard(JSON.stringify(allObservationsData, null, 2));
    } else {
      // Load data first, then copy
      setIsDownloadLoading(true);
      try {
        const data = await loadAllData();
        void copyTextToClipboard(JSON.stringify(data, null, 2));
      } finally {
        setIsDownloadLoading(false);
      }
    }
  }, [allObservationsData, loadAllData]);

  // Download JSON handler - different behavior for virtualized vs non-virtualized
  const handleDownloadJson = useCallback(async () => {
    if (isVirtualized) {
      // Virtualized mode: build from tree + cache (no fetching)
      setIsDownloadLoading(true);
      // Use setTimeout to allow spinner to render before potentially heavy operation
      setTimeout(() => {
        const data = buildDataFromCache();
        downloadJsonData(data);
        setIsDownloadLoading(false);
      }, 0);
    } else {
      // Non-virtualized mode: fetch all data if needed
      if (allObservationsData) {
        downloadJsonData(allObservationsData);
      } else {
        setIsDownloadLoading(true);
        try {
          const data = await loadAllData();
          downloadJsonData(data);
        } finally {
          setIsDownloadLoading(false);
        }
      }
    }
  }, [
    isVirtualized,
    allObservationsData,
    loadAllData,
    buildDataFromCache,
    downloadJsonData,
  ]);

  // Loading state for download button
  const isDownloadOrCopyLoading = isDownloadLoading || isLoadingAllData;

  return {
    // Only provide copy handler for non-virtualized mode
    handleCopyJson: isVirtualized ? undefined : handleCopyJson,
    handleDownloadJson,
    isDownloadOrCopyLoading,
  };
}
