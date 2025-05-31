import { useEffect } from "react";

/**
 * Hook that handles row highlighting without causing React re-renders.
 * Uses direct DOM manipulation to apply/remove CSS classes based on the current peek ID.
 *
 * @param peekViewId - The ID of the currently selected row for peek view
 * @param tableContainerRef - Ref to the table container element
 */
export const useRowHighlighting = (
  peekViewId: string | undefined,
  tableContainerRef: React.RefObject<HTMLElement>,
) => {
  useEffect(() => {
    const tableContainer = tableContainerRef.current;
    if (!tableContainer) return;

    // Remove all existing highlights
    tableContainer.querySelectorAll(".bg-accent").forEach((row) => {
      row.classList.remove("bg-accent");
    });

    // Add highlight to current row if peekViewId exists
    if (peekViewId) {
      const targetRow = tableContainer.querySelector(
        `[data-row-id="${peekViewId}"]`,
      );
      if (targetRow) {
        targetRow.classList.add("bg-accent");
      }
    }
  }, [peekViewId, tableContainerRef]);
};
