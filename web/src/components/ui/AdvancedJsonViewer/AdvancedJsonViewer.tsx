/**
 * AdvancedJsonViewer - Main JSON viewer component
 *
 * Self-contained JSON viewer with zero external dependencies (except TanStack Virtual and Radix UI).
 * Combines all sub-components and hooks to provide a complete JSON viewing experience.
 *
 * Features:
 * - Virtualized rendering for large datasets
 * - Search with highlighting and navigation
 * - Expand/collapse with state management
 * - Type-aware syntax highlighting
 * - String truncation with popovers
 * - Copy to clipboard
 * - Optional line numbers
 * - Theme customization
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { type AdvancedJsonViewerProps } from "./types";
import { searchInTree, getMatchCountsPerNode } from "./utils/searchJson";
import { useJsonTheme } from "./hooks/useJsonTheme";
import { useSearchNavigationTree } from "./hooks/useSearchNavigationTree";
import { useTreeState } from "./hooks/useTreeState";
import { SearchBar } from "./components/SearchBar";
import { SimpleJsonViewer } from "./SimpleJsonViewer";
import { VirtualizedJsonViewer } from "./VirtualizedJsonViewer";
import { debugLog } from "./utils/debug";

/**
 * AdvancedJsonViewer - Self-contained JSON viewer
 */
export function AdvancedJsonViewer({
  data,
  field = null,
  virtualized: virtualizedProp,
  theme: userTheme,
  initialExpansion = true,
  enableSearch = true,
  searchPlaceholder = "Search JSON...",
  searchQuery: controlledSearchQuery,
  onSearchQueryChange,
  currentMatchIndex: controlledCurrentMatchIndex,
  onCurrentMatchIndexChange,
  matchCounts,
  showLineNumbers = false,
  enableCopy = true,
  stringWrapMode = "wrap",
  onStringWrapModeChange: _onStringWrapModeChange,
  truncateStringsAt = 100,
  className,
  isLoading = false,
  error,
  scrollContainerRef,
  commentedPaths,
}: AdvancedJsonViewerProps) {
  debugLog("[AdvancedJsonViewer] RENDER");
  // Resolve theme
  const theme = useJsonTheme(userTheme);

  // Search state management
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const [internalCurrentMatchIndex, setInternalCurrentMatchIndex] = useState(0);

  const isSearchControlled =
    controlledSearchQuery !== undefined && onSearchQueryChange !== undefined;
  const searchQuery = isSearchControlled
    ? controlledSearchQuery
    : internalSearchQuery;

  const isMatchIndexControlled =
    controlledCurrentMatchIndex !== undefined &&
    onCurrentMatchIndexChange !== undefined;
  const currentMatchIndex = isMatchIndexControlled
    ? controlledCurrentMatchIndex
    : internalCurrentMatchIndex;

  // Build tree from JSON data (sync for <10K, worker for >10K)
  // JIT expansion: reads from storage directly, no context subscription
  // Tree building uses FULL untruncated widths (data layer)
  const {
    tree,
    isBuilding,
    buildError,
    expansionVersion,
    handleToggleExpansion: treeHandleToggleExpansion,
  } = useTreeState(data, field, initialExpansion, {
    rootKey: "root",
    indentSizePx: theme.indentSize,
  });

  // Search matches
  const searchMatches = useMemo(() => {
    debugLog("[AdvancedJsonViewer] Computing searchMatches");
    return tree
      ? searchInTree(tree, searchQuery, { caseSensitive: false })
      : [];
  }, [tree, searchQuery]);

  // Calculate match counts for collapsed nodes
  const calculatedMatchCounts = useMemo(() => {
    debugLog("[AdvancedJsonViewer] Computing calculatedMatchCounts");
    return tree && searchMatches.length > 0
      ? getMatchCountsPerNode(tree, searchMatches)
      : matchCounts;
  }, [tree, searchMatches, matchCounts]);

  // Reset match index when matches change
  useEffect(() => {
    if (searchMatches.length > 0 && currentMatchIndex >= searchMatches.length) {
      if (isMatchIndexControlled) {
        onCurrentMatchIndexChange(0);
      } else {
        setInternalCurrentMatchIndex(0);
      }
    }
  }, [
    searchMatches,
    currentMatchIndex,
    isMatchIndexControlled,
    onCurrentMatchIndexChange,
  ]);

  // Determine if virtualization should be used
  // Use initial tree size (totalNodeCount) rather than current visible rows
  // This decision should be stable regardless of expansion state
  const shouldUseVirtualization = useMemo(() => {
    if (virtualizedProp !== undefined) return virtualizedProp;
    if (!tree) return false;

    // Virtualize if tree has more than 500 nodes total
    // This is based on the initial data structure size, not current expansion
    return tree.totalNodeCount > 500;
  }, [virtualizedProp, tree]);

  // Use tree's built-in toggle (already O(log n), no spinner needed)
  const handleToggleExpansion = treeHandleToggleExpansion;

  // Search navigation
  const {
    handleNextMatch,
    handlePreviousMatch,
    handleClearSearch,
    scrollToIndex,
  } = useSearchNavigationTree({
    searchMatches,
    currentMatchIndex,
    tree,
    isMatchIndexControlled,
    onCurrentMatchIndexChange,
    setInternalCurrentMatchIndex,
    onToggleExpansion: treeHandleToggleExpansion,
  });

  // Handle search
  const handleSearch = useCallback(
    (query: string) => {
      if (isSearchControlled) {
        onSearchQueryChange(query);
      } else {
        setInternalSearchQuery(query);
      }

      // Reset match index to 0 when search query changes
      if (isMatchIndexControlled) {
        onCurrentMatchIndexChange(0);
      } else {
        setInternalCurrentMatchIndex(0);
      }
    },
    [
      isSearchControlled,
      onSearchQueryChange,
      isMatchIndexControlled,
      onCurrentMatchIndexChange,
    ],
  );

  // Wrap handleClearSearch to pass required params
  const handleClearSearchWrapped = useCallback(() => {
    handleClearSearch(
      isSearchControlled,
      onSearchQueryChange,
      setInternalSearchQuery,
    );
  }, [handleClearSearch, isSearchControlled, onSearchQueryChange]);

  // Common viewer props - memoized to prevent unnecessary re-renders
  // MUST be defined before early returns to satisfy React Hooks rules
  const viewerProps = useMemo(() => {
    debugLog("[AdvancedJsonViewer] Creating viewerProps object");
    return {
      tree,
      expansionVersion,
      theme,
      searchMatches,
      currentMatchIndex,
      matchCounts: calculatedMatchCounts,
      showLineNumbers,
      enableCopy,
      stringWrapMode,
      truncateStringsAt,
      onToggleExpansion: handleToggleExpansion,
      scrollToIndex,
      scrollContainerRef,
      totalLineCount: tree?.totalNodeCount,
      commentedPaths,
    };
  }, [
    tree,
    expansionVersion,
    theme,
    searchMatches,
    currentMatchIndex,
    calculatedMatchCounts,
    showLineNumbers,
    enableCopy,
    stringWrapMode,
    truncateStringsAt,
    handleToggleExpansion,
    scrollToIndex,
    scrollContainerRef,
    commentedPaths,
  ]);

  // Early returns for special states
  // Loading state
  if (isLoading) {
    return (
      <div className={className} style={{ padding: "16px" }}>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    const errorMessage = typeof error === "string" ? error : error.message;
    return (
      <div className={className} style={{ padding: "16px" }}>
        <div className="text-sm text-destructive">Error: {errorMessage}</div>
      </div>
    );
  }

  // Build error state
  if (buildError) {
    return (
      <div className={className} style={{ padding: "16px" }}>
        <div className="text-sm text-destructive">
          Error building tree: {buildError}
        </div>
      </div>
    );
  }

  // Building state (show ONLY during initial load)
  if (isBuilding && !tree) {
    return (
      <div className={className} style={{ padding: "16px" }}>
        <div className="text-sm text-muted-foreground">Processing JSON...</div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        ...(shouldUseVirtualization && { height: "100%" }),
      }}
    >
      {/* Search bar */}
      {enableSearch && (
        <SearchBar
          onSearch={handleSearch}
          matches={searchMatches}
          currentIndex={currentMatchIndex}
          onNext={handleNextMatch}
          onPrevious={handlePreviousMatch}
          onClear={handleClearSearchWrapped}
          placeholder={searchPlaceholder}
        />
      )}

      {/* Viewer - conditionally render without creating new component references */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {shouldUseVirtualization ? (
          <VirtualizedJsonViewer {...viewerProps} />
        ) : (
          <SimpleJsonViewer {...viewerProps} />
        )}
      </div>
    </div>
  );
}
