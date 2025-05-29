import { useEffect, useRef } from "react";

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
  const lastHighlightedRowRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const tableContainer = tableContainerRef.current;
    if (!tableContainer) return;

    // Remove previous highlighting
    if (lastHighlightedRowRef.current) {
      lastHighlightedRowRef.current.classList.remove("bg-accent");
      lastHighlightedRowRef.current = null;
    }

    // Apply new highlighting if peekViewId exists
    if (peekViewId) {
      // Find the row with matching data-row-id attribute
      const targetRow = tableContainer.querySelector(
        `[data-row-id="${peekViewId}"]`,
      ) as HTMLElement;

      if (targetRow) {
        targetRow.classList.add("bg-accent");
        lastHighlightedRowRef.current = targetRow;
      }
    }
  }, [peekViewId, tableContainerRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (lastHighlightedRowRef.current) {
        lastHighlightedRowRef.current.classList.remove("bg-accent");
      }
    };
  }, []);
};
