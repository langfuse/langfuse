/**
 * useSearchNavigationTree - Tree-based search navigation hook
 *
 * Handles:
 * - Navigating to next/previous search matches in tree mode
 * - Clearing search
 * - Auto-expanding ancestors to show matches
 * - Computing scroll-to index using tree navigation
 *
 * Tree-compatible version of useSearchNavigation
 */

import { useMemo, useCallback } from "react";
import type { SearchMatch } from "../types";
import type { TreeState } from "../utils/treeStructure";
import { expandToMatch_Tree, findNodeVisibleIndex } from "../utils/searchJson";

interface UseSearchNavigationTreeParams {
  searchMatches: SearchMatch[];
  currentMatchIndex: number;
  tree: TreeState | null;
  isMatchIndexControlled: boolean;
  onCurrentMatchIndexChange?: (index: number) => void;
  setInternalCurrentMatchIndex: (index: number) => void;
  onToggleExpansion: (nodeId: string) => void; // Tree-based toggle (unused but kept for future)
}

export function useSearchNavigationTree({
  searchMatches,
  currentMatchIndex,
  tree,
  isMatchIndexControlled,
  onCurrentMatchIndexChange,
  setInternalCurrentMatchIndex,
  onToggleExpansion: _onToggleExpansion,
}: UseSearchNavigationTreeParams) {
  // Navigate to next match
  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0 || !tree) return;

    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;

    if (isMatchIndexControlled) {
      onCurrentMatchIndexChange?.(nextIndex);
    } else {
      setInternalCurrentMatchIndex(nextIndex);
    }

    // Expand ancestors to show the match
    const match = searchMatches[nextIndex];
    if (match) {
      expandToMatch_Tree(tree, match);
      // Trigger re-render by toggling (expansion is already done, this is just for UI sync)
      // Note: expandToMatch_Tree mutates tree in place, caller needs to handle expansionVersion increment
    }
  }, [
    searchMatches,
    currentMatchIndex,
    tree,
    isMatchIndexControlled,
    onCurrentMatchIndexChange,
    setInternalCurrentMatchIndex,
  ]);

  // Navigate to previous match
  const handlePreviousMatch = useCallback(() => {
    if (searchMatches.length === 0 || !tree) return;

    const prevIndex =
      (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;

    if (isMatchIndexControlled) {
      onCurrentMatchIndexChange?.(prevIndex);
    } else {
      setInternalCurrentMatchIndex(prevIndex);
    }

    // Expand ancestors to show the match
    const match = searchMatches[prevIndex];
    if (match) {
      expandToMatch_Tree(tree, match);
    }
  }, [
    searchMatches,
    currentMatchIndex,
    tree,
    isMatchIndexControlled,
    onCurrentMatchIndexChange,
    setInternalCurrentMatchIndex,
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

      // Reset match index
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

  // Compute scroll-to index for current match
  const scrollToIndex = useMemo(() => {
    if (searchMatches.length === 0 || !tree) return undefined;

    const currentMatch = searchMatches[currentMatchIndex];
    if (!currentMatch) return undefined;

    // Find visible index of matched node
    return findNodeVisibleIndex(tree, currentMatch.rowId);
  }, [searchMatches, currentMatchIndex, tree]);

  return {
    handleNextMatch,
    handlePreviousMatch,
    handleClearSearch,
    scrollToIndex: scrollToIndex !== -1 ? scrollToIndex : undefined,
  };
}
