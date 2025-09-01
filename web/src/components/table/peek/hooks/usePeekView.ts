import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { useRouter } from "next/router";
import { useMemo, useCallback } from "react";

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

  const peekViewId = router.query.peek?.toString();

  const row = useMemo(() => {
    if (!peekViewId) return undefined;

    try {
      return getRow(peekViewId);
    } catch (error) {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekViewId, getRow, peekView?.tableDataUpdatedAt]);

  const handleOnRowClickPeek = useCallback(
    (clickedRow: TData) => {
      if (!peekView) return;

      const rowId =
        "id" in clickedRow && typeof clickedRow.id === "string"
          ? clickedRow.id
          : undefined;
      if (!rowId) return;

      // Read current peek param from URL to avoid router.query staleness.
      const currentPeekFromURL = new URLSearchParams(
        window.location.search,
      ).get("peek");

      if (rowId === currentPeekFromURL) {
        peekView.onOpenChange(false);
      } else {
        const timestamp =
          "timestamp" in clickedRow
            ? (clickedRow.timestamp as Date)
            : undefined;
        peekView.onOpenChange(true, rowId, timestamp?.toISOString());
      }
    },
    [peekView],
  );

  return {
    handleOnRowClickPeek: peekView ? handleOnRowClickPeek : undefined,
    peekViewId,
    row,
  };
};
