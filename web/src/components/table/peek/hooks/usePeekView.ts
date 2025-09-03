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

type UsePeekViewProps = {
  peekView?: PeekViewProps;
};

/**
 * A hook that manages the peek view state for a data table.
 *
 * @param peekView - Optional configuration for the peek view
 *
 * @returns An object containing:
 * - handleOnRowClickPeek: Function to handle row clicks for peek view
 *
 */

export const usePeekView = ({ peekView }: UsePeekViewProps) => {
  const router = useRouter();

  // Update the row state when the user clicks on a row
  const handleOnRowClickPeek = (id: string) => {
    if (peekView) {
      // update url with the row id
      router.push({
        pathname: router.pathname,
        query: { ...router.query, peek: id },
      });
      peekView.onOpenChange(true, id);
    }
  };

  return {
    handleOnRowClickPeek: peekView ? handleOnRowClickPeek : undefined,
  };
};
