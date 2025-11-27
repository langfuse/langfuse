/**
 * TraceLogView - Log view of trace observations with conditional virtualization.
 *
 * Features:
 * - Conditional virtualization based on observation count threshold
 * - Non-virtualized (< 150 obs): All rows in DOM, full features
 * - Virtualized (>= 150 obs): Only visible rows rendered
 * - Lazy I/O loading (data fetched only when row is expanded)
 * - Two view modes: chronological (by time) and tree-order (DFS hierarchy)
 * - Search filtering by name, type, or ID
 * - Expandable rows with full I/O preview
 * - Copy/Download JSON functionality
 *
 * Uses JSONTableView for table rendering with domain-specific column definitions.
 */

import { useState, useMemo, useCallback } from "react";
import { useTraceData } from "@/src/components/trace2/contexts/TraceDataContext";
import { useViewPreferences } from "@/src/components/trace2/contexts/ViewPreferencesContext";
import { useJsonExpansion } from "@/src/components/trace2/contexts/JsonExpansionContext";
import { ItemBadge } from "@/src/components/ItemBadge";
import {
  JSONTableView,
  type JSONTableViewColumn,
} from "@/src/components/trace2/components/_shared/JSONTableView";
import {
  flattenChronological,
  flattenTreeOrder,
  filterBySearch,
} from "./log-view-flattening";
import { type FlatLogItem } from "./log-view-types";
import { LogViewToolbar } from "./LogViewToolbar";
import { LogViewExpandedContent } from "./LogViewExpandedContent";
import { LogViewTreeIndent } from "./LogViewTreeIndent";
import { LogViewJsonMode } from "./LogViewJsonMode";
import { LOG_VIEW_CONFIRMATION_THRESHOLD } from "./useLogViewConfirmation";
import {
  formatDisplayName,
  formatRelativeTime,
  formatDuration,
  formatDepthIndicator,
} from "./log-view-formatters";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { useLogViewAllObservationsIO } from "./useLogViewAllObservationsIO";

export interface TraceLogViewProps {
  traceId: string;
  projectId: string;
  currentView?: "pretty" | "json";
}

// Row height constants for virtualization
const COLLAPSED_ROW_HEIGHT = 28;
const EXPANDED_ROW_HEIGHT = 150;

export const TraceLogView = ({
  traceId,
  projectId,
  currentView = "pretty",
}: TraceLogViewProps) => {
  const { tree, observations } = useTraceData();
  const { logViewMode, logViewTreeStyle } = useViewPreferences();
  const { expansionState, setFieldExpansion } = useJsonExpansion();

  // Determine if we should virtualize based on observation count
  const isVirtualized = observations.length >= LOG_VIEW_CONFIRMATION_THRESHOLD;

  // Get expanded keys from context (persisted in sessionStorage)
  // Uses dynamic key format: logViewRows:${traceId}
  const expandedRowsKey = `logViewRows:${traceId}`;
  const expandedRowsState = (expansionState[expandedRowsKey] ?? {}) as Record<
    string,
    boolean
  >;

  const expandedKeys = useMemo(() => {
    return new Set(
      Object.entries(expandedRowsState)
        .filter(([, isExpanded]) => isExpanded)
        .map(([id]) => id),
    );
  }, [expandedRowsState]);

  // Update expanded keys in context
  const setExpandedKeys = useCallback(
    (keysOrUpdater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      const newKeys =
        typeof keysOrUpdater === "function"
          ? keysOrUpdater(expandedKeys)
          : keysOrUpdater;

      // Convert Set to Record<string, boolean>
      const newState: Record<string, boolean> = {};
      newKeys.forEach((id) => {
        newState[id] = true;
      });

      setFieldExpansion(expandedRowsKey, newState);
    },
    [expandedKeys, setFieldExpansion, expandedRowsKey],
  );

  // Local state for search
  const [searchQuery, setSearchQuery] = useState("");

  // State for JSON view collapse
  const [jsonViewCollapsed, setJsonViewCollapsed] = useState(false);

  // State for indent visualization
  const [indentEnabled, setIndentEnabled] = useState(false);

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

  // Tree style: flat for chronological, use preference for tree-order
  const treeStyle = logViewMode === "chronological" ? "flat" : logViewTreeStyle;

  // Define columns - combined observation column with optional indentation
  const columns = useMemo((): JSONTableViewColumn<FlatLogItem>[] => {
    const baseColumns: JSONTableViewColumn<FlatLogItem>[] = [
      {
        key: "observation",
        header: "Observation",
        width: "flex-1",
        render: (item) => {
          const displayName = formatDisplayName(item.node);
          const childrenCount = item.node.children?.length ?? 0;
          // 12px indent per depth level when enabled
          const indent = indentEnabled ? item.node.depth * 12 : 0;

          return (
            <div
              className="flex h-5 min-w-0 items-center gap-2"
              style={{ paddingLeft: indent }}
            >
              <ItemBadge type={item.node.type} isSmall />
              <span className="truncate">{displayName}</span>
              {childrenCount > 0 && (
                <span className="flex-shrink-0 text-xs text-muted-foreground">
                  {childrenCount} {childrenCount === 1 ? "item" : "items"}
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: "depth",
        header: "Depth",
        width: "w-12",
        align: "right" as const,
        render: (item) => (
          <span className="text-xs text-muted-foreground">
            {item.node.depth >= 0 ? `L${item.node.depth}` : "-"}
          </span>
        ),
      },
      {
        key: "duration",
        header: "Duration",
        width: "w-16",
        align: "right" as const,
        render: (item) => (
          <span className="text-xs text-muted-foreground">
            {formatDuration(item.node.startTime, item.node.endTime)}
          </span>
        ),
      },
      {
        key: "time",
        header: "Time",
        width: "w-12",
        align: "right" as const,
        render: (item) => (
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(item.node.startTimeSinceTrace)}
          </span>
        ),
      },
    ];

    return baseColumns;
  }, [indentEnabled]);

  // Render tree indentation for indented mode
  const renderRowPrefix = useCallback(
    (item: FlatLogItem) => {
      if (treeStyle !== "indented" || item.node.depth <= 0) return null;

      return (
        <LogViewTreeIndent
          treeLines={item.treeLines}
          isLastSibling={item.isLastSibling}
          depth={item.node.depth}
        />
      );
    },
    [treeStyle],
  );

  // Render expanded content with JSON expansion context integration
  const renderExpanded = useCallback(
    (item: FlatLogItem) => {
      const observationExpansionKey = `log:${item.node.id}`;

      return (
        <LogViewExpandedContent
          node={item.node}
          traceId={traceId}
          projectId={projectId}
          currentView={currentView}
          externalExpansionState={
            !isVirtualized ? expansionState[observationExpansionKey] : undefined
          }
          onExternalExpansionChange={
            !isVirtualized
              ? (exp) => setFieldExpansion(observationExpansionKey, exp)
              : undefined
          }
        />
      );
    },
    [
      traceId,
      projectId,
      currentView,
      isVirtualized,
      expansionState,
      setFieldExpansion,
    ],
  );

  // Track if all rows are expanded (for non-virtualized mode)
  const allRowsExpanded = useMemo(() => {
    if (flatItems.length === 0) return false;
    return flatItems.every((item) => expandedKeys.has(item.node.id));
  }, [flatItems, expandedKeys]);

  // Toggle expand/collapse all (non-virtualized mode only)
  const handleToggleExpandAll = useCallback(() => {
    if (allRowsExpanded) {
      // Collapse all
      setExpandedKeys(new Set());
    } else {
      // Expand all
      const allKeys = new Set(flatItems.map((item) => item.node.id));
      setExpandedKeys(allKeys);
    }
  }, [allRowsExpanded, flatItems]);

  // Fetch all observation data for copy/download (enabled when needed)
  const { data: allObservationsData } = useLogViewAllObservationsIO({
    items: flatItems,
    traceId,
    projectId,
    enabled: currentView === "json" || flatItems.length > 0,
  });

  // Copy JSON handler
  const handleCopyJson = useCallback(() => {
    if (allObservationsData) {
      const textToCopy = JSON.stringify(allObservationsData, null, 2);
      void copyTextToClipboard(textToCopy);
    }
  }, [allObservationsData]);

  // Download JSON handler
  const handleDownloadJson = useCallback(() => {
    if (allObservationsData) {
      const blob = new Blob([JSON.stringify(allObservationsData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trace-${traceId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [allObservationsData, traceId]);

  // Toggle JSON view collapse
  const handleToggleJsonCollapse = useCallback(() => {
    setJsonViewCollapsed((prev) => !prev);
  }, []);

  // Check if there are any observations at all
  const hasNoObservations = allItems.length === 0;
  const hasNoSearchResults = !hasNoObservations && flatItems.length === 0;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Toolbar with search and actions */}
      <LogViewToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isVirtualized={isVirtualized}
        onToggleExpandAll={handleToggleExpandAll}
        allRowsExpanded={allRowsExpanded}
        onCopyJson={handleCopyJson}
        onDownloadJson={handleDownloadJson}
        currentView={currentView}
        indentEnabled={indentEnabled}
        onToggleIndent={() => setIndentEnabled((prev) => !prev)}
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

      {/* JSON view mode - render all observations as single JSON */}
      {flatItems.length > 0 && currentView === "json" && (
        <LogViewJsonMode
          items={flatItems}
          traceId={traceId}
          projectId={projectId}
          isCollapsed={jsonViewCollapsed}
          onToggleCollapse={handleToggleJsonCollapse}
        />
      )}

      {/* Table view mode - render as expandable table */}
      {flatItems.length > 0 && currentView === "pretty" && (
        <JSONTableView
          items={flatItems}
          columns={columns}
          getItemKey={(item) => item.node.id}
          expandable
          renderExpanded={renderExpanded}
          expandedKeys={expandedKeys}
          onExpandedKeysChange={setExpandedKeys}
          virtualized={isVirtualized}
          collapsedRowHeight={COLLAPSED_ROW_HEIGHT}
          expandedRowHeight={EXPANDED_ROW_HEIGHT}
          renderRowPrefix={renderRowPrefix}
        />
      )}
    </div>
  );
};
