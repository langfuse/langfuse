/**
 * useJsonSearch - Hook for managing search-related calculations
 *
 * Handles:
 * - Building a map of rowId -> SearchMatch for O(1) lookup
 * - Getting the current match for highlighting
 * - Calculating current match index within its row
 *
 * Used by both VirtualizedJsonViewer and SimpleJsonViewer
 */

import { useMemo } from "react";
import { type SearchMatch } from "../types";
import { getCurrentMatchIndexInRow } from "../utils/searchJson";

export function useJsonSearch(
  searchMatches: SearchMatch[],
  currentMatchIndex: number,
) {
  // Build a map of rowId -> match for quick lookup
  const matchMap = useMemo(() => {
    const map = new Map<string, SearchMatch>();
    searchMatches.forEach((match) => {
      map.set(match.rowId, match);
    });
    return map;
  }, [searchMatches]);

  // Get current match for highlighting
  const currentMatch = searchMatches[currentMatchIndex];

  // Get current match index within its row (1-based)
  const currentMatchIndexInRow = useMemo(
    () => getCurrentMatchIndexInRow(currentMatchIndex, searchMatches),
    [currentMatchIndex, searchMatches],
  );

  return {
    matchMap,
    currentMatch,
    currentMatchIndexInRow,
  };
}
