/**
 * @fileoverview Simple hook for managing pivot table sort state with session storage
 *
 * Features:
 * - Session-based persistence using sessionStorage
 * - Simple state: OrderByState | null (null = unsorted)
 * - Initialization priority: session storage → defaultSort → null
 * - Type-safe with graceful error handling
 */

import { useState, useCallback, useEffect } from "react";
import { type OrderByState } from "@langfuse/shared";

const STORAGE_KEY_PREFIX = "langfuse-pivot_sort_";

/**
 * Safely retrieves sort state from session storage
 *
 * @param widgetId - Widget identifier for storage key
 * @returns OrderByState (sort object), null (explicitly unsorted), or undefined (never stored)
 */
function getStoredSortState(widgetId: string): OrderByState | null | undefined {
  try {
    const stored = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${widgetId}`);
    if (!stored) return undefined; // Never stored
    if (stored === "null") return null; // Explicitly unsorted
    return JSON.parse(stored); // Sort object
  } catch (error) {
    console.warn("Failed to retrieve sort state from session storage:", error);
    return undefined;
  }
}

/**
 * Safely stores sort state to session storage
 *
 * @param widgetId - Widget identifier for storage key
 * @param sortState - OrderByState to store, or null for explicitly unsorted
 */
function setStoredSortState(
  widgetId: string,
  sortState: OrderByState | null,
): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${widgetId}`;
    if (sortState === null) {
      sessionStorage.setItem(key, "null"); // Store unsorted
    } else {
      sessionStorage.setItem(key, JSON.stringify(sortState));
    }
  } catch (error) {
    console.warn("Failed to store sort state to session storage:", error);
  }
}

/**
 * Simple hook for managing pivot table sort state with session storage
 *
 * @param widgetId - Unique identifier for the widget instance
 * @param defaultSort - Optional default sort configuration
 * @returns Object containing current sort state and update function
 */
export function usePivotTableSort(
  widgetId: string,
  defaultSort?: OrderByState | null,
) {
  // Initialize with priority: session storage → defaultSort → null
  const [sortState, setSortState] = useState<OrderByState | null>(() => {
    const stored = getStoredSortState(widgetId);
    if (stored !== undefined) {
      return stored; // Could be null (unsorted) or sort object
    }
    return defaultSort || null;
  });

  // Apply defaultSort when it becomes available (after widget data loads)
  // but only if user hasn't interacted yet (no session storage)
  useEffect(() => {
    if (defaultSort && getStoredSortState(widgetId) === undefined) {
      setSortState(defaultSort);
    }
  }, [defaultSort, widgetId]);

  // Update function that persists changes
  const updateSort = useCallback(
    (newSort: OrderByState | null) => {
      setSortState(newSort);
      setStoredSortState(widgetId, newSort);
    },
    [widgetId],
  );

  return {
    sortState,
    updateSort,
  };
}

export default usePivotTableSort;
