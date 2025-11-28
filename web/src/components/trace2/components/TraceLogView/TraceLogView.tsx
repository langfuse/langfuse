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

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
import {
  formatDisplayName,
  formatRelativeTime,
  formatDuration,
} from "./log-view-formatters";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { useLogViewAllObservationsIO } from "./useLogViewAllObservationsIO";
import { useLogViewPreferences } from "./useLogViewPreferences";
import { usePrefetchObservation } from "@/src/components/trace2/api/usePrefetchObservation";

export interface TraceLogViewProps {
  traceId: string;
  projectId: string;
  currentView?: "pretty" | "json";
}

// Row height constants for virtualization
const COLLAPSED_ROW_HEIGHT = 28;
const EXPANDED_ROW_HEIGHT = 150;

// Disable indent visualization when tree is deeper than this threshold
const INDENT_DEPTH_THRESHOLD = 5;

// Threshold for enabling virtualization (observation count)
export const LOG_VIEW_VIRTUALIZATION_THRESHOLD = 100;

/**
 * Cell component for the observation column that prefetches data when entering viewport.
 */
interface LogViewObservationCellProps {
  item: FlatLogItem;
  indentEnabled: boolean;
  projectId: string;
  traceId: string;
}

const LogViewObservationCell = ({
  item,
  indentEnabled,
  projectId,
  traceId,
}: LogViewObservationCellProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { prefetch } = usePrefetchObservation({ projectId });
  const hasPrefetched = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || item.node.type === "TRACE") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !hasPrefetched.current) {
          // Debounce: wait 250ms before prefetching to avoid firing
          // many requests during fast scrolling
          timeoutRef.current = setTimeout(() => {
            hasPrefetched.current = true;
            prefetch(item.node.id, traceId, item.node.startTime);
          }, 250);
        } else if (!entry?.isIntersecting && timeoutRef.current) {
          // Cancel pending prefetch if element leaves viewport
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      },
      { rootMargin: "100px" },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [item.node.id, item.node.type, item.node.startTime, traceId, prefetch]);

  const displayName = formatDisplayName(item.node);
  const childrenCount = item.node.children?.length ?? 0;
  const indent = indentEnabled ? item.node.depth * 12 : 0;

  return (
    <div
      ref={ref}
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
};

export const TraceLogView = ({
  traceId,
  projectId,
  currentView = "pretty",
}: TraceLogViewProps) => {
  const { tree, observations } = useTraceData();
  const { logViewMode, logViewTreeStyle } = useViewPreferences();
  const { expansionState, setFieldExpansion } = useJsonExpansion();

  // Determine if we should virtualize based on observation count
  const isVirtualized =
    observations.length >= LOG_VIEW_VIRTUALIZATION_THRESHOLD;

  // Get expanded keys from context (persisted in sessionStorage)
  // Uses dynamic key format: logViewRows:${traceId}
  const expandedRowsKey = `logViewRows:${traceId}`;

  const expandedKeys = useMemo(() => {
    const expandedRowsState = (expansionState[expandedRowsKey] ?? {}) as Record<
      string,
      boolean
    >;
    return new Set(
      Object.entries(expandedRowsState)
        .filter(([, isExpanded]) => isExpanded)
        .map(([id]) => id),
    );
  }, [expansionState, expandedRowsKey]);

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

  // Preferences from localStorage
  const {
    indentEnabled: indentEnabledPref,
    setIndentEnabled,
    showMilliseconds,
    setShowMilliseconds,
  } = useLogViewPreferences();

  // Disable indent when tree is too deep
  const indentDisabled = tree.childrenDepth > INDENT_DEPTH_THRESHOLD;
  const indentEnabled = indentEnabledPref && !indentDisabled;

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
        render: (item) => (
          <LogViewObservationCell
            item={item}
            indentEnabled={indentEnabled}
            projectId={projectId}
            traceId={traceId}
          />
        ),
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
        key: "start",
        header: "Start",
        width: showMilliseconds ? "w-20" : "w-12",
        align: "right" as const,
        render: (item) => (
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(
              item.node.startTimeSinceTrace,
              showMilliseconds,
            )}
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
    ];

    return baseColumns;
  }, [indentEnabled, showMilliseconds, projectId, traceId]);

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
  // Always persist expansion state regardless of virtualization mode
  const renderExpanded = useCallback(
    (item: FlatLogItem) => {
      const observationExpansionKey = `log:${item.node.id}`;

      return (
        <LogViewExpandedContent
          node={item.node}
          traceId={traceId}
          projectId={projectId}
          currentView={currentView}
          externalExpansionState={expansionState[observationExpansionKey]}
          onExternalExpansionChange={(exp) =>
            setFieldExpansion(observationExpansionKey, exp)
          }
        />
      );
    },
    [traceId, projectId, currentView, expansionState, setFieldExpansion],
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
  }, [allRowsExpanded, flatItems, setExpandedKeys]);

  // On-demand loading hook for observation I/O data
  // Does NOT auto-fetch - call loadAllData() or buildDataFromCache() when needed
  const {
    data: allObservationsData,
    isLoading: isLoadingAllData,
    loadAllData,
    buildDataFromCache,
  } = useLogViewAllObservationsIO({
    items: flatItems,
    traceId,
    projectId,
  });

  // Track if we're actively loading for download
  const [isDownloadLoading, setIsDownloadLoading] = useState(false);

  // Helper to download JSON data
  const downloadJsonData = useCallback(
    (data: unknown) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trace-${traceId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [traceId],
  );

  // Copy JSON handler (non-virtualized mode)
  const handleCopyJson = useCallback(async () => {
    if (allObservationsData) {
      // Data already loaded, copy immediately
      void copyTextToClipboard(JSON.stringify(allObservationsData, null, 2));
    } else {
      // Load data first, then copy
      setIsDownloadLoading(true);
      try {
        const data = await loadAllData();
        void copyTextToClipboard(JSON.stringify(data, null, 2));
      } finally {
        setIsDownloadLoading(false);
      }
    }
  }, [allObservationsData, loadAllData]);

  // Download JSON handler - different behavior for virtualized vs non-virtualized
  const handleDownloadJson = useCallback(async () => {
    if (isVirtualized) {
      // Virtualized mode: build from tree + cache (no fetching)
      setIsDownloadLoading(true);
      // Use setTimeout to allow spinner to render before potentially heavy operation
      setTimeout(() => {
        const data = buildDataFromCache();
        downloadJsonData(data);
        setIsDownloadLoading(false);
      }, 0);
    } else {
      // Non-virtualized mode: fetch all data if needed
      if (allObservationsData) {
        downloadJsonData(allObservationsData);
      } else {
        setIsDownloadLoading(true);
        try {
          const data = await loadAllData();
          downloadJsonData(data);
        } finally {
          setIsDownloadLoading(false);
        }
      }
    }
  }, [
    isVirtualized,
    allObservationsData,
    loadAllData,
    buildDataFromCache,
    downloadJsonData,
  ]);

  // Toggle JSON view collapse
  const handleToggleJsonCollapse = useCallback(() => {
    setJsonViewCollapsed((prev) => !prev);
  }, []);

  // Check if there are any observations at all
  const hasNoObservations = allItems.length === 0;
  const hasNoSearchResults = !hasNoObservations && flatItems.length === 0;

  // Loading state for download button
  const isDownloadOrCopyLoading = isDownloadLoading || isLoadingAllData;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Toolbar with search and actions */}
      <LogViewToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isVirtualized={isVirtualized}
        onToggleExpandAll={handleToggleExpandAll}
        allRowsExpanded={allRowsExpanded}
        onCopyJson={isVirtualized ? undefined : handleCopyJson}
        onDownloadJson={handleDownloadJson}
        isDownloadLoading={isDownloadOrCopyLoading}
        currentView={currentView}
        indentEnabled={indentEnabled}
        indentDisabled={indentDisabled}
        onToggleIndent={() => setIndentEnabled(!indentEnabledPref)}
        showMilliseconds={showMilliseconds}
        onToggleMilliseconds={() => setShowMilliseconds(!showMilliseconds)}
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

      {/* JSON view mode - render all observations as single JSON (disabled when virtualized) */}
      {flatItems.length > 0 && currentView === "json" && !isVirtualized && (
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
          overscan={100}
          collapsedRowHeight={COLLAPSED_ROW_HEIGHT}
          expandedRowHeight={EXPANDED_ROW_HEIGHT}
          renderRowPrefix={renderRowPrefix}
        />
      )}
    </div>
  );
};
