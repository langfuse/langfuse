import useLocalStorage from "@/src/components/useLocalStorage";
import { type ColumnSizingState } from "@tanstack/react-table";
import debounce from "lodash/debounce";
import { useEffect, useMemo, useState } from "react";

/**
 * Persists table column widths to localStorage with automatic debounced saving.
 *
 * @param tableId - Unique identifier for the table to scope column settings
 * @returns Column sizing state, setter, and utility functions for TanStack Table integration
 *
 * @note Limitation: Multi-tab sync occurs only on page refresh/navigation, not in real-time.
 * @note Column state is initialized once on mount from localStorage.
 */
export const useColumnSizing = (tableId: string) => {
  const [storedSizing, setStoredSizing] = useLocalStorage<ColumnSizingState>(
    `table-columns-${tableId}`,
    {},
  );

  const [columnSizing, setColumnSizing] =
    useState<ColumnSizingState>(storedSizing);

  // Debounced storage update
  const debouncedSave = useMemo(
    () =>
      debounce((sizing: ColumnSizingState) => {
        if (tableId && Object.keys(sizing).length > 0) {
          setStoredSizing(sizing);
        }
      }, 500),
    [tableId, setStoredSizing],
  );

  // Save to storage when state changes
  useEffect(() => {
    debouncedSave(columnSizing);
  }, [columnSizing, debouncedSave]);

  return {
    columnSizing,
    setColumnSizing,
  };
};
