import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { useRouter } from "next/router";

/**
 * Props for configuring a peek view in a data table.
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
export type PeekViewProps = DataTablePeekViewProps & {
  tableDataUpdatedAt: number;
};

type UsePeekViewProps<TData> = {
  getRow: (id: string) => TData | undefined;
  peekView?: PeekViewProps;
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
 *
 */

export const usePeekView = <TData extends object>({
  peekView,
}: UsePeekViewProps<TData>) => {
  const router = useRouter();

  const peekViewId = router.query.peek as string | undefined;

  // Update the row state when the user clicks on a row
  const handleOnRowClickPeek = () => {
    if (peekView) {
      peekView.onOpenChange(true, peekViewId);
    }
  };

  return {
    handleOnRowClickPeek: peekView ? handleOnRowClickPeek : undefined,
    peekViewId,
  };
};
