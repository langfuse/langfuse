import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Props for configuring a peek view in a data table.
 *
 * @template TData The type of data in the table rows
 *
 * @property isTableDataComplete - Indicates whether all data (including asynchronously loaded data like metrics)
 * has finished loading. This is critical for proper table memoization - when false, it ensures the table
 * continues to re-render as additional data loads, even when the primary data reference remains stable.
 * Set this to true only when ALL data needed for rendering the table is fully loaded.
 *
 * Common usage pattern:
 * ```
 * isTableDataComplete: !metricsQuery.isLoading && metricsQuery.data !== undefined
 * ```
 */
export type PeekViewProps<TData> = Omit<
  DataTablePeekViewProps<TData>,
  "selectedRowId" | "row"
> & {
  tableDataUpdatedAt: number;
};

function getInitialRow<TData>(
  peekViewId: string | undefined,
  getRow: (id: string) => TData | undefined,
): TData | undefined {
  if (!peekViewId) return undefined;
  try {
    const row = getRow(peekViewId);
    return row ? row : undefined;
  } catch (error) {
    return undefined;
  }
}

// Helper function to get current URL peek parameter
function getCurrentPeekUrl() {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  return params.get("peek") ?? undefined;
}

type UsePeekViewProps<TData> = {
  getRow: (id: string) => TData | undefined;
  peekView?: PeekViewProps<TData>;
};

/**
 * A hook that manages the peek view state for a data table.
 *
 * @param getRow - The React Table's getRow function
 * @param peekView - Optional configuration for the peek view
 *
 * @returns An object containing:
 * - handleOnRowClickPeek: Function to handle row clicks for peek view
 * - inflatedPeekView: The peek view props with the selected row data
 * - peekViewId: The ID of the currently selected row for peek view
 *
 * The peek view allows users to preview details of a row without navigating away from the table.
 * It manages the URL state via query parameters and handles row selection/deselection.
 */

export const usePeekView = <TData extends object>({
  getRow,
  peekView,
}: UsePeekViewProps<TData>) => {
  // Get current peek ID from URL
  const peekViewId = getCurrentPeekUrl();

  const [row, setRow] = useState<TData | undefined>(
    getInitialRow(peekViewId, getRow),
  );

  // // Track if we've attempted to find the row for this peekViewId
  const lastAttemptedPeekViewId = useRef<string | undefined>();

  // Update row when peekViewId changes or table data updates
  useEffect(() => {
    if (!peekView || !peekViewId) {
      setRow(undefined);
      lastAttemptedPeekViewId.current = undefined;
      return;
    }

    // Only attempt to find the row if:
    // 1. We haven't tried for this peekViewId yet, OR
    // 2. The table data has been updated (new data might contain the row)
    const shouldAttemptFind =
      lastAttemptedPeekViewId.current !== peekViewId || !row;

    if (shouldAttemptFind) {
      const foundRow = getInitialRow(peekViewId, getRow);
      setRow(foundRow);
      lastAttemptedPeekViewId.current = peekViewId;
    }
  }, [peekViewId, peekView?.tableDataUpdatedAt, getRow, peekView, row]);

  const inflatedPeekView = peekView
    ? { ...peekView, selectedRowId: peekViewId, row }
    : undefined;

  // Create a stable handleOnRowClickPeek function
  const handleOnRowClickPeek = useCallback(
    (row: TData) => {
      if (!peekView) return;

      // Get current peek ID from URL
      const currentPeekViewId = getCurrentPeekUrl();

      const rowId =
        "id" in row && typeof row.id === "string" ? row.id : undefined;

      // If clicking the same row that's already open, close it
      if (rowId === currentPeekViewId) {
        peekView.onOpenChange(false);
        setRow(undefined);
      }
      // If clicking a different row update the row data and URL
      else {
        const timestamp =
          "timestamp" in row ? (row.timestamp as Date) : undefined;
        peekView.onOpenChange(true, rowId, timestamp?.toISOString());
        setRow(row);
      }
    },
    [], // Empty dependency array - stable!
  );

  // Update the row state when the peekViewId changes on detail page navigation
  useEffect(() => {
    if (!peekView || !peekView.shouldUpdateRowOnDetailPageNavigation) return;

    const rowId =
      row && "id" in row && typeof row.id === "string" ? row.id : undefined;

    if (peekViewId !== rowId) {
      if (peekViewId && inflatedPeekView) {
        try {
          const row = getRow(peekViewId);
          if (row) {
            setRow(row);
          }
        } catch (error) {
          console.log("Row not found in table:", error);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekViewId]);

  return {
    handleOnRowClickPeek: peekView ? handleOnRowClickPeek : undefined,
    inflatedPeekView,
    peekViewId,
  };
};
