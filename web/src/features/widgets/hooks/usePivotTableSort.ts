/**
 * @fileoverview Custom hook for managing pivot table sort state with session storage persistence
 *
 * This hook provides state management for pivot table sorting with the following features:
 * - Session-based persistence using sessionStorage
 * - Type-safe sort state using OrderByState from shared types
 * - Graceful error handling for storage failures
 * - Automatic cleanup and fallback behavior
 *
 * Usage:
 * - Used by PivotTable component for interactive sorting
 * - Integrated with DashboardWidget for widget-level state management
 * - Provides consistent sorting behavior across widget instances
 */

import { useState, useCallback, useEffect } from "react";
import { type OrderByState } from "@langfuse/shared";

/**
 * Storage key prefix for pivot table sort state
 * Includes widget ID to ensure per-widget isolation
 */
const STORAGE_KEY_PREFIX = "langfuse-pivotTableSort";

/**
 * Generates a unique storage key for a specific widget instance
 *
 * @param widgetId - Unique identifier for the widget
 * @returns Storage key string for session storage
 */
function getStorageKey(widgetId: string): string {
  return `${STORAGE_KEY_PREFIX}_${widgetId}`;
}

/**
 * Safely retrieves sort state from session storage
 *
 * @param widgetId - Widget identifier for storage key generation
 * @returns Parsed OrderByState or null if not found/invalid
 */
function getStoredSortState(widgetId: string): OrderByState {
  try {
    const storageKey = getStorageKey(widgetId);
    const stored = sessionStorage.getItem(storageKey);

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);

    // Validate the parsed data matches OrderByState structure
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.column === "string" &&
      (parsed.order === "ASC" || parsed.order === "DESC")
    ) {
      return parsed;
    }

    // Invalid data, return null
    return null;
  } catch (error) {
    // Silently fail and return null for any storage errors
    console.warn(
      "Failed to retrieve pivot table sort state from session storage:",
      error,
    );
    return null;
  }
}

/**
 * Safely stores sort state to session storage
 *
 * @param widgetId - Widget identifier for storage key generation
 * @param sortState - OrderByState to store
 */
function setStoredSortState(widgetId: string, sortState: OrderByState): void {
  try {
    const storageKey = getStorageKey(widgetId);

    if (sortState) {
      sessionStorage.setItem(storageKey, JSON.stringify(sortState));
    } else {
      sessionStorage.removeItem(storageKey);
    }
  } catch (error) {
    // Silently fail for storage errors (e.g., quota exceeded, private browsing)
    console.warn(
      "Failed to store pivot table sort state to session storage:",
      error,
    );
  }
}

/**
 * Custom hook for managing pivot table sort state with session storage persistence
 *
 * Features:
 * - Initializes with stored state from session storage
 * - Provides update function that persists changes
 * - Handles storage errors gracefully
 * - Maintains type safety with OrderByState
 *
 * @param widgetId - Unique identifier for the widget instance
 * @param defaultSort - Optional default sort configuration for new widgets
 * @returns Object containing current sort state and update function
 */
export function usePivotTableSort(
  widgetId: string,
  defaultSort?: OrderByState,
) {
  // Initialize state with stored value or default
  const [sortState, setSortState] = useState<OrderByState>(() => {
    const stored = getStoredSortState(widgetId);
    return stored ?? defaultSort ?? null;
  });

  // Update function that persists changes to session storage
  const updateSort = useCallback(
    (newSort: OrderByState) => {
      setSortState(newSort);
      setStoredSortState(widgetId, newSort);
    },
    [widgetId],
  );

  // Clear sort state (removes from storage)
  const clearSort = useCallback(() => {
    setSortState(null);
    setStoredSortState(widgetId, null);
  }, [widgetId]);

  // Reset to default sort
  const resetToDefault = useCallback(() => {
    const newState = defaultSort ?? null;
    setSortState(newState);
    setStoredSortState(widgetId, newState);
  }, [widgetId, defaultSort]);

  // Effect to handle widget ID changes (should be rare)
  useEffect(() => {
    const stored = getStoredSortState(widgetId);
    if (stored !== null) {
      setSortState(stored);
    } else if (defaultSort !== undefined) {
      setSortState(defaultSort);
    }
  }, [widgetId, defaultSort]);

  return {
    sortState,
    updateSort,
    clearSort,
    resetToDefault,
  };
}

export default usePivotTableSort;
