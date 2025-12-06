/**
 * useSearchNavigation - Hook for managing search navigation
 *
 * Handles:
 * - Navigating to next/previous search matches
 * - Clearing search
 * - Auto-expanding ancestors to show matches
 * - Computing scroll-to index for virtualized viewer
 *
 * Used by AdvancedJsonViewer
 */

import { useMemo, useCallback } from "react";
import type { SearchMatch, FlatJSONRow, ExpansionState } from "../types";
import { expandToMatch } from "../utils/searchJson";

interface UseSearchNavigationParams {
  searchMatches: SearchMatch[];
  currentMatchIndex: number;
  flatRows: FlatJSONRow[];
  expansionState: ExpansionState;
  isMatchIndexControlled: boolean;
  onCurrentMatchIndexChange?: (index: number) => void;
  setInternalCurrentMatchIndex: (index: number) => void;
  isExpansionControlled: boolean;
  onExpansionChange?: (state: ExpansionState) => void;
  setInternalExpansionState: (state: ExpansionState) => void;
}

export function useSearchNavigation({
  searchMatches,
  currentMatchIndex,
  flatRows,
  expansionState,
  isMatchIndexControlled,
  onCurrentMatchIndexChange,
  setInternalCurrentMatchIndex,
  isExpansionControlled,
  onExpansionChange,
  setInternalExpansionState,
}: UseSearchNavigationParams) {
  // Navigate to next match
  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;

    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;

    if (isMatchIndexControlled) {
      onCurrentMatchIndexChange?.(nextIndex);
    } else {
      setInternalCurrentMatchIndex(nextIndex);
    }

    // Expand ancestors to show the match
    const match = searchMatches[nextIndex];
    if (match) {
      const newExpansion = expandToMatch(match, flatRows, expansionState);
      if (isExpansionControlled) {
        onExpansionChange?.(newExpansion);
      } else {
        setInternalExpansionState(newExpansion);
      }
    }
  }, [
    searchMatches,
    currentMatchIndex,
    flatRows,
    expansionState,
    isExpansionControlled,
    onExpansionChange,
    isMatchIndexControlled,
    onCurrentMatchIndexChange,
    setInternalCurrentMatchIndex,
    setInternalExpansionState,
  ]);

  // Navigate to previous match
  const handlePreviousMatch = useCallback(() => {
    if (searchMatches.length === 0) return;

    const prevIndex =
      currentMatchIndex === 0
        ? searchMatches.length - 1
        : currentMatchIndex - 1;

    if (isMatchIndexControlled) {
      onCurrentMatchIndexChange?.(prevIndex);
    } else {
      setInternalCurrentMatchIndex(prevIndex);
    }

    // Expand ancestors to show the match
    const match = searchMatches[prevIndex];
    if (match) {
      const newExpansion = expandToMatch(match, flatRows, expansionState);
      if (isExpansionControlled) {
        onExpansionChange?.(newExpansion);
      } else {
        setInternalExpansionState(newExpansion);
      }
    }
  }, [
    searchMatches,
    currentMatchIndex,
    flatRows,
    expansionState,
    isExpansionControlled,
    onExpansionChange,
    isMatchIndexControlled,
    onCurrentMatchIndexChange,
    setInternalCurrentMatchIndex,
    setInternalExpansionState,
  ]);

  // Clear search
  const handleClearSearch = useCallback(
    (
      isSearchControlled: boolean,
      onSearchQueryChange?: (query: string) => void,
      setInternalSearchQuery?: (query: string) => void,
    ) => {
      if (isSearchControlled) {
        onSearchQueryChange?.("");
      } else {
        setInternalSearchQuery?.("");
      }

      if (isMatchIndexControlled) {
        onCurrentMatchIndexChange?.(0);
      } else {
        setInternalCurrentMatchIndex(0);
      }
    },
    [
      isMatchIndexControlled,
      onCurrentMatchIndexChange,
      setInternalCurrentMatchIndex,
    ],
  );

  // Get scroll index for current match (for virtualized viewer)
  const scrollToIndex = useMemo(() => {
    if (searchMatches.length === 0) return undefined;
    return searchMatches[currentMatchIndex]?.rowIndex;
  }, [searchMatches, currentMatchIndex]);

  return {
    handleNextMatch,
    handlePreviousMatch,
    handleClearSearch,
    scrollToIndex,
  };
}
