import { DataTablePeekViewProps } from "@/src/components/table/peek";
import { useReactTable } from "@tanstack/react-table";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export type PeekViewProps<TData> = Omit<
  DataTablePeekViewProps<TData>,
  "selectedRowId" | "row"
>;

function getInitialRow<TData>(
  peekViewId: string | undefined,
  table: ReturnType<typeof useReactTable<TData>>,
): TData | undefined {
  if (!peekViewId) return undefined;
  try {
    const row = table.getRow(peekViewId);
    return row ? row.original : undefined;
  } catch (error) {
    return undefined;
  }
}

type UsePeekViewProps<TData> = {
  table: ReturnType<typeof useReactTable<TData>>;
  peekView?: PeekViewProps<TData>;
  shouldUpdateRowOnDetailPageNavigation?: boolean;
};

/**
 * A hook that manages the peek view state for a data table.
 *
 * @param table - The React Table instance
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
  table,
  peekView,
  shouldUpdateRowOnDetailPageNavigation = false,
}: UsePeekViewProps<TData>) => {
  if (!peekView) return { inflatedPeekView: undefined, peekViewId: undefined };

  const router = useRouter();
  const peekViewId = router.query.peek as string | undefined;
  const [row, setRow] = useState<TData | undefined>(
    getInitialRow(peekViewId, table),
  );
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
      // If clicking a different row, just update the URL without setting row data yet
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
    if (!shouldUpdateRowOnDetailPageNavigation) return;

    const rowId =
      row && "id" in row && typeof row.id === "string" ? row.id : undefined;

    if (peekViewId !== rowId) {
      if (peekViewId && inflatedPeekView) {
        try {
          const row = table.getRow(peekViewId);
          if (row) {
            setRow(row.original);
          }
        } catch (error) {
          console.log("Row not found in table:", error);
        }
      }
    }
  }, [peekViewId]);

  return {
    handleOnRowClickPeek,
    inflatedPeekView,
    peekViewId,
  };
};
