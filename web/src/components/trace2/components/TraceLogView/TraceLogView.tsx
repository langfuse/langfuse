/**
 * TraceLogView - Virtualized log view of trace observations.
 *
 * Features:
 * - Virtualized rendering using @tanstack/react-virtual
 * - Lazy I/O loading (data fetched only when row is expanded)
 * - Two view modes: chronological (by time) and tree-order (DFS hierarchy)
 * - Search filtering by name, type, or ID
 * - Expandable rows with full I/O preview
 * - Sticky header showing topmost visible observation
 *
 * State management:
 * - expandedRows: Set<string> managed locally for virtualizer estimateSize
 * - searchQuery: Local state for search filtering
 * - Mode/style preferences from ViewPreferencesContext
 * - Tree data from TraceDataContext
 */

import { useState, useMemo, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTraceData } from "@/src/components/trace2/contexts/TraceDataContext";
import { useViewPreferences } from "@/src/components/trace2/contexts/ViewPreferencesContext";
import {
  flattenChronological,
  flattenTreeOrder,
  filterBySearch,
} from "./log-view-flattening";
import { LogViewRow } from "./LogViewRow";
import { LogViewStickyHeader } from "./LogViewStickyHeader";
import { LogViewTableHeader } from "./LogViewTableHeader";
import { LogViewToolbar } from "./LogViewToolbar";
import { useTopmostVisibleItem } from "./useTopmostVisibleItem";

export interface TraceLogViewProps {
  traceId: string;
  projectId: string;
}

// Row height constants for virtualization
const COLLAPSED_ROW_HEIGHT = 28; // min-h-6 (24px) + py-0.5 (2px each side) + border
const EXPANDED_ROW_HEIGHT = 150; // Estimated, will be measured dynamically

export const TraceLogView = ({ traceId, projectId }: TraceLogViewProps) => {
  const { tree } = useTraceData();
  const { logViewMode, setLogViewMode, logViewTreeStyle, setLogViewTreeStyle } =
    useViewPreferences();
  const parentRef = useRef<HTMLDivElement>(null);

  // Lifted state for expand/collapse - needed for virtualizer estimateSize
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Local state for search
  const [searchQuery, setSearchQuery] = useState("");

  // Flatten tree based on mode
  const allItems = useMemo(() => {
    return logViewMode === "chronological"
      ? flattenChronological(tree)
      : flattenTreeOrder(tree);
  }, [tree, logViewMode]);

  // Apply search filter
  const flatItems = useMemo(() => {
    return filterBySearch(allItems, searchQuery);
  }, [allItems, searchQuery]);

  // Toggle expand/collapse for a row
  const handleToggle = useCallback((nodeId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Estimate row size based on expand state
  const estimateSize = useCallback(
    (index: number) => {
      const item = flatItems[index];
      if (!item) return COLLAPSED_ROW_HEIGHT;
      return expandedRows.has(item.node.id)
        ? EXPANDED_ROW_HEIGHT
        : COLLAPSED_ROW_HEIGHT;
    },
    [flatItems, expandedRows],
  );

  // Set up virtualizer
  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 10, // Render 10 extra items outside viewport
    measureElement:
      typeof window !== "undefined"
        ? (element) => element.getBoundingClientRect().height
        : undefined,
  });

  // Tree style: flat for chronological, use preference for tree-order
  const treeStyle = logViewMode === "chronological" ? "flat" : logViewTreeStyle;

  // Track the topmost visible item for sticky header
  const { item: topmostItem, index: topmostIndex } = useTopmostVisibleItem({
    virtualizer: rowVirtualizer,
    items: flatItems,
  });

  // Check if there are any observations at all
  const hasNoObservations = allItems.length === 0;
  const hasNoSearchResults = !hasNoObservations && flatItems.length === 0;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Toolbar with mode toggle and search */}
      <LogViewToolbar
        mode={logViewMode}
        onModeChange={setLogViewMode}
        treeStyle={logViewTreeStyle}
        onTreeStyleChange={setLogViewTreeStyle}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={allItems.length}
        filteredCount={flatItems.length}
      />

      {/* Empty states */}
      {hasNoObservations && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-sm text-muted-foreground">
            No observations in this trace
          </div>
        </div>
      )}

      {hasNoSearchResults && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-sm text-muted-foreground">
            No observations match &quot;{searchQuery}&quot;
          </div>
        </div>
      )}

      {/* Sticky header showing topmost visible observation */}
      {flatItems.length > 0 && (
        <LogViewStickyHeader
          item={topmostItem}
          totalCount={flatItems.length}
          currentIndex={topmostIndex}
        />
      )}

      {/* Sticky table header with column labels */}
      {flatItems.length > 0 && <LogViewTableHeader treeStyle={treeStyle} />}

      {/* Virtualized list container */}
      {flatItems.length > 0 && (
        <div ref={parentRef} className="flex-1 overflow-y-scroll">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = flatItems[virtualRow.index];
              if (!item) return null;

              const isExpanded = expandedRows.has(item.node.id);

              return (
                <div
                  key={item.node.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <LogViewRow
                    item={item}
                    isExpanded={isExpanded}
                    onToggle={handleToggle}
                    treeStyle={treeStyle}
                    traceId={traceId}
                    projectId={projectId}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
