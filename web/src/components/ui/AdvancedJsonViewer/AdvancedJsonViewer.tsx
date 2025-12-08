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

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  startTransition,
} from "react";
import { type AdvancedJsonViewerProps, type ExpansionState } from "./types";
import { toggleRowExpansion } from "./utils/flattenJson";
import { searchInRows } from "./utils/searchJson";
import { shouldVirtualize } from "./utils/estimateRowHeight";
import { useJsonTheme } from "./hooks/useJsonTheme";
import { useSearchNavigation } from "./hooks/useSearchNavigation";
import { useFlattenedJson } from "./hooks/useFlattenedJson";
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
  matchCounts,
  showLineNumbers = false,
  enableCopy = true,
  stringWrapMode = "truncate",
  onStringWrapModeChange: _onStringWrapModeChange,
  truncateStringsAt = 100,
  showArrayIndices: _showArrayIndices = true, // TODO: Implement array indices feature
  groupArraysAbove: _groupArraysAbove, // TODO: Implement array grouping feature
  className,
  isLoading = false,
  error,
  scrollContainerRef,
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

  // Track which row is being toggled (for spinner display)
  const [togglingRowId, setTogglingRowId] = useState<string | null>(null);

  // Flatten JSON data in Web Worker (non-blocking)
  const {
    flatRows,
    totalLineCount,
    isFlattening,
    isReady,
    flattenTime,
    flattenError,
  } = useFlattenedJson({
    data,
    expansionState,
    config: {
      rootKey: "root",
      maxDepth: null,
      maxRows: null,
    },
  });

  // Log flatten performance
  useEffect(() => {
    if (isReady && flattenTime !== undefined) {
      console.log(
        `[AdvancedJsonViewer] Flatten completed in ${flattenTime.toFixed(2)}ms (${flatRows.length} rows)`,
      );
    }
  }, [isReady, flattenTime, flatRows.length]);

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
      console.log(
        "[AdvancedJsonViewer] handleToggleExpansion START for rowId:",
        rowId,
      );
      console.time("[AdvancedJsonViewer] handleToggleExpansion (sync part)");

      // Set toggling state to show spinner on button
      setTogglingRowId(rowId);

      // Heavy computation (flattenJSON + virtualizer update) happens in background
      // This keeps the UI responsive - button press feedback is immediate
      startTransition(() => {
        console.time("[AdvancedJsonViewer] handleToggleExpansion (transition)");

        const newExpansion = toggleRowExpansion(rowId, expansionState);

        if (isExpansionControlled) {
          onExpansionChange(newExpansion);
        } else {
          setInternalExpansionState(newExpansion);
        }

        console.timeEnd(
          "[AdvancedJsonViewer] handleToggleExpansion (transition)",
        );
        console.log("[AdvancedJsonViewer] handleToggleExpansion END");

        // Clear toggling state after transition completes
        setTogglingRowId(null);
      });

      console.timeEnd("[AdvancedJsonViewer] handleToggleExpansion (sync part)");
    },
    [expansionState, isExpansionControlled, onExpansionChange],
  );

  // Search navigation
  const {
    handleNextMatch,
    handlePreviousMatch,
    handleClearSearch,
    scrollToIndex,
  } = useSearchNavigation({
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

  // Flatten error state
  if (flattenError) {
    return (
      <div className={className} style={{ padding: "16px" }}>
        <div className="text-sm text-destructive">
          Error flattening JSON: {flattenError}
        </div>
      </div>
    );
  }

  // Flattening state (show ONLY during initial load when no rows exist yet)
  // During expand/collapse, we show spinner on the button instead (no flickering)
  if (isFlattening && flatRows.length === 0 && togglingRowId === null) {
    return (
      <div className={className} style={{ padding: "16px" }}>
        <div className="text-sm text-muted-foreground">Processing JSON...</div>
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
          onClear={handleClearSearchWrapped}
          placeholder={searchPlaceholder}
        />
      )}

      {/* Viewer */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Viewer
          rows={flatRows}
          theme={theme}
          searchMatches={searchMatches}
          currentMatchIndex={currentMatchIndex}
          matchCounts={matchCounts}
          showLineNumbers={showLineNumbers}
          enableCopy={enableCopy}
          stringWrapMode={stringWrapMode}
          truncateStringsAt={truncateStringsAt}
          onToggleExpansion={handleToggleExpansion}
          scrollToIndex={scrollToIndex}
          scrollContainerRef={scrollContainerRef}
          totalLineCount={totalLineCount}
          togglingRowId={togglingRowId}
        />
      </div>
    </div>
  );
}
