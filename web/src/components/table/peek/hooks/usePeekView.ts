import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

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
export type PeekViewProps<TData> = DataTablePeekViewProps<TData> & {
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
 * - peekViewId: The ID of the currently selected row for peek view
 * - row: The currently selected row for peek view
 *
 * The peek view allows users to preview details of a row without navigating away from the table.
 * It manages the URL state via query parameters and handles row selection/deselection.
 */

export const usePeekView = <TData extends object>({
  getRow,
  peekView,
}: UsePeekViewProps<TData>) => {
  const router = useRouter();

  const peekViewId = router.query.peek as string | undefined;
  const [row, setRow] = useState<TData | undefined>(
    getInitialRow(peekViewId, getRow),
  );

  // Populate the row after the table is mounted
  const attemptRef = useRef(false);

  // Try to find the row with delayed attempts
  useEffect(() => {
    if (peekView && peekViewId && !row && !attemptRef.current) {
      attemptRef.current = true;
      let foundOnce = false;
      let intervalId = setInterval(() => {
        const foundRow = getInitialRow(peekViewId, getRow);
        if (foundRow) {
          setRow(foundRow);
          if (foundOnce) clearInterval(intervalId);
          foundOnce = true;
        }
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update the row state when the user clicks on a row
  const handleOnRowClickPeek = (row: TData) => {
    if (peekView) {
      const rowId =
        "id" in row && typeof row.id === "string" ? row.id : undefined;
      // If clicking the same row that's already open, close it
      if (rowId === peekViewId) {
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
    }
  };

  // Update the row state when the peekViewId changes on detail page navigation
  useEffect(() => {
    if (!peekView || !peekView.shouldUpdateRowOnDetailPageNavigation) return;

    const rowId =
      row && "id" in row && typeof row.id === "string" ? row.id : undefined;

    if (peekViewId !== rowId) {
      if (peekViewId && peekView) {
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
    peekViewId,
    row,
  };
};
