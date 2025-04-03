import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

export type PeekViewProps<TData> = Omit<
  DataTablePeekViewProps<TData>,
  "selectedRowId" | "row"
>;

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
  shouldUpdateRowOnDetailPageNavigation?: boolean;
};

/**
 * A hook that manages the peek view state for a data table.
 *
 * @param getRow - The React Table's getRow function
 * @param peekView - Optional configuration for the peek view
 * @param shouldUpdateRowOnDetailPageNavigation - Whether to update the row when the peekViewId changes on detail page navigation. If you do not require the row data to be updated, set this to false. Be mindful of this setting as it adds one extra re-render to the table when the detail page is navigated to.
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
  shouldUpdateRowOnDetailPageNavigation = false,
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

  const inflatedPeekView = peekView
    ? { ...peekView, selectedRowId: peekViewId, row }
    : undefined;

  // Update the row state when the user clicks on a row
  const handleOnRowClickPeek = (row: TData) => {
    if (inflatedPeekView) {
      const rowId =
        "id" in row && typeof row.id === "string" ? row.id : undefined;
      // If clicking the same row that's already open, close it
      if (rowId === inflatedPeekView.selectedRowId) {
        inflatedPeekView.onOpenChange(false);
        setRow(undefined);
      }
      // If clicking a different row update the row data and URL
      else {
        const timestamp =
          "timestamp" in row ? (row.timestamp as Date) : undefined;
        inflatedPeekView.onOpenChange(true, rowId, timestamp?.toISOString());
        setRow(row);
      }
    }
  };

  // Update the row state when the peekViewId changes on detail page navigation
  useEffect(() => {
    if (!shouldUpdateRowOnDetailPageNavigation || !peekView) return;

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
