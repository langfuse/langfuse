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
import { type AdvancedJsonViewerProps, type ExpansionState } from "./types";
import { flattenJSON, toggleRowExpansion } from "./utils/flattenJson";
import { searchInRows, expandToMatch } from "./utils/searchJson";
import { shouldVirtualize } from "./utils/estimateRowHeight";
import { useJsonTheme } from "./hooks/useJsonTheme";
import { SearchBar } from "./components/SearchBar";
import { SimpleJsonViewer } from "./SimpleJsonViewer";
import { VirtualizedJsonViewer } from "./VirtualizedJsonViewer";

/**
 * AdvancedJsonViewer - Self-contained JSON viewer
 */
export function AdvancedJsonViewer({
  data,
  virtualized: virtualizedProp,
  theme: userTheme,
  initialExpansion = true,
  expansionState: controlledExpansionState,
  onExpansionChange,
  enableSearch = true,
  searchPlaceholder = "Search JSON...",
  searchQuery: controlledSearchQuery,
  onSearchQueryChange,
  currentMatchIndex: controlledCurrentMatchIndex,
  onCurrentMatchIndexChange,
  showLineNumbers = false,
  enableCopy = true,
  truncateStringsAt = 100,
  wrapLongStrings = false,
  showArrayIndices: _showArrayIndices = true, // TODO: Implement array indices feature
  groupArraysAbove: _groupArraysAbove, // TODO: Implement array grouping feature
  className,
  isLoading = false,
  error,
}: AdvancedJsonViewerProps) {
  // Resolve theme
  const theme = useJsonTheme(userTheme);

  // Expansion state management
  const [internalExpansionState, setInternalExpansionState] =
    useState<ExpansionState>(initialExpansion);

  const isExpansionControlled =
    controlledExpansionState !== undefined && onExpansionChange !== undefined;
  const expansionState = isExpansionControlled
    ? controlledExpansionState
    : internalExpansionState;

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

  // Flatten JSON data
  const flatRows = useMemo(
    () =>
      flattenJSON(data, expansionState, {
        rootKey: "root",
        maxDepth: null,
        maxRows: null,
      }),
    [data, expansionState],
  );

  // Search matches
  const searchMatches = useMemo(
    () => searchInRows(flatRows, searchQuery, { caseSensitive: false }),
    [flatRows, searchQuery],
  );

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
  const shouldUseVirtualization = useMemo(() => {
    if (virtualizedProp !== undefined) return virtualizedProp;
    return shouldVirtualize(flatRows, {
      baseHeight: theme.lineHeight,
      longStringThreshold: truncateStringsAt ?? 100,
      charsPerLine: 80,
    });
  }, [virtualizedProp, flatRows, theme.lineHeight, truncateStringsAt]);

  // Handle expansion toggle
  const handleToggleExpansion = useCallback(
    (rowId: string) => {
      const newExpansion = toggleRowExpansion(rowId, expansionState);

      if (isExpansionControlled) {
        onExpansionChange(newExpansion);
      } else {
        setInternalExpansionState(newExpansion);
      }
    },
    [expansionState, isExpansionControlled, onExpansionChange],
  );

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

  // Navigate to next match
  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;

    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;

    if (isMatchIndexControlled) {
      onCurrentMatchIndexChange(nextIndex);
    } else {
      setInternalCurrentMatchIndex(nextIndex);
    }

    // Expand ancestors to show the match
    const match = searchMatches[nextIndex];
    if (match) {
      const newExpansion = expandToMatch(match, flatRows, expansionState);
      if (isExpansionControlled) {
        onExpansionChange(newExpansion);
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
  ]);

  // Navigate to previous match
  const handlePreviousMatch = useCallback(() => {
    if (searchMatches.length === 0) return;

    const prevIndex =
      currentMatchIndex === 0
        ? searchMatches.length - 1
        : currentMatchIndex - 1;

    if (isMatchIndexControlled) {
      onCurrentMatchIndexChange(prevIndex);
    } else {
      setInternalCurrentMatchIndex(prevIndex);
    }

    // Expand ancestors to show the match
    const match = searchMatches[prevIndex];
    if (match) {
      const newExpansion = expandToMatch(match, flatRows, expansionState);
      if (isExpansionControlled) {
        onExpansionChange(newExpansion);
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
  ]);

  // Clear search
  const handleClearSearch = useCallback(() => {
    if (isSearchControlled) {
      onSearchQueryChange("");
    } else {
      setInternalSearchQuery("");
    }

    if (isMatchIndexControlled) {
      onCurrentMatchIndexChange(0);
    } else {
      setInternalCurrentMatchIndex(0);
    }
  }, [
    isSearchControlled,
    onSearchQueryChange,
    isMatchIndexControlled,
    onCurrentMatchIndexChange,
  ]);

  // Get scroll index for current match (for virtualized viewer)
  const scrollToIndex = useMemo(() => {
    if (searchMatches.length === 0) return undefined;
    return searchMatches[currentMatchIndex]?.rowIndex;
  }, [searchMatches, currentMatchIndex]);

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

  // Select viewer component
  const Viewer = shouldUseVirtualization
    ? VirtualizedJsonViewer
    : SimpleJsonViewer;

  return (
    <div
      className={className}
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      {/* Search bar */}
      {enableSearch && (
        <SearchBar
          onSearch={handleSearch}
          matches={searchMatches}
          currentIndex={currentMatchIndex}
          onNext={handleNextMatch}
          onPrevious={handlePreviousMatch}
          onClear={handleClearSearch}
          placeholder={searchPlaceholder}
        />
      )}

      {/* Viewer */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Viewer
          rows={flatRows}
          theme={theme}
          searchMatches={searchMatches}
          currentMatchIndex={currentMatchIndex}
          showLineNumbers={showLineNumbers}
          enableCopy={enableCopy}
          truncateStringsAt={truncateStringsAt}
          wrapLongStrings={wrapLongStrings}
          onToggleExpansion={handleToggleExpansion}
          scrollToIndex={scrollToIndex}
        />
      </div>
    </div>
  );
}
