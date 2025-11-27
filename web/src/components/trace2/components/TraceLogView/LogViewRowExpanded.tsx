/**
 * LogViewRowExpanded - Expanded state of a log view row.
 *
 * Fetches and displays observation data as JSON properties.
 * Uses lazy loading - data is only fetched when row is expanded.
 */

import { memo, useMemo } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { ItemBadge } from "@/src/components/ItemBadge";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type TreeNode } from "@/src/components/trace2/lib/types";
import { useLogViewObservationIO } from "./useLogViewObservationIO";
import { useClickWithoutSelection } from "@/src/hooks/useClickWithoutSelection";
import {
  formatDisplayName,
  formatRelativeTime,
  formatDuration,
} from "./log-view-formatters";

export interface LogViewRowExpandedProps {
  node: TreeNode;
  traceId: string;
  projectId: string;
  onCollapse: () => void;
  currentView?: "pretty" | "json";
  /** Optional external expansion state for JSON tree (non-virtualized mode) */
  externalExpansionState?: Record<string, boolean> | boolean;
  /** Callback when expansion state changes (non-virtualized mode) */
  onExternalExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
}

/**
 * Expanded row with full observation data as JSON.
 * Fetches observation data lazily when mounted.
 */
export const LogViewRowExpanded = memo(function LogViewRowExpanded({
  node,
  traceId,
  projectId,
  onCollapse,
  currentView = "pretty",
  externalExpansionState,
  onExternalExpansionChange,
}: LogViewRowExpandedProps) {
  const displayName = formatDisplayName(node);
  const relativeTime = formatRelativeTime(node.startTimeSinceTrace);
  const duration = formatDuration(node.startTime, node.endTime);

  // Fetch I/O data lazily
  const { data, isLoading, isError } = useLogViewObservationIO({
    observationId: node.id,
    traceId,
    projectId,
    startTime: node.startTime,
    enabled: true, // Always enabled when mounted (row is expanded)
  });

  // Build JSON object with all observation properties
  const jsonData = useMemo(() => {
    if (!data) return null;

    // Filter out null/undefined values for cleaner display
    const result: Record<string, unknown> = {};

    if (data.input !== null && data.input !== undefined) {
      result.input = data.input;
    }
    if (data.output !== null && data.output !== undefined) {
      result.output = data.output;
    }
    if (data.metadata !== null && data.metadata !== undefined) {
      result.metadata = data.metadata;
    }

    return Object.keys(result).length > 0 ? result : null;
  }, [data]);

  // Use click-without-selection to allow text selection while still supporting collapse
  const { props: clickProps } = useClickWithoutSelection({
    onClick: onCollapse,
  });

  return (
    <div className="border-b border-border bg-background">
      {/* Header - clickable to collapse */}
      <div
        className="flex min-h-6 cursor-pointer items-center gap-2 border-b border-border/50 bg-muted/30 px-3 py-0.5 hover:bg-muted/50"
        {...clickProps}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onCollapse();
          }
        }}
      >
        {/* Collapse icon */}
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />

        {/* Type badge */}
        <ItemBadge type={node.type} isSmall />

        {/* Name */}
        <span className="min-w-0 flex-1 truncate text-sm">{displayName}</span>

        {/* Right-aligned columns: Depth, Duration, Time */}
        <span className="w-12 flex-shrink-0 text-right text-xs text-muted-foreground">
          {node.depth >= 0 ? `L${node.depth}` : "-"}
        </span>
        <span className="w-16 flex-shrink-0 text-right text-xs text-muted-foreground">
          {duration}
        </span>
        <span className="w-12 flex-shrink-0 text-right text-xs text-muted-foreground">
          {relativeTime}
        </span>
      </div>

      {/* Content area - JSON properties (no max-height, virtualizer handles scroll) */}
      <div className="w-full">
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">
              Loading...
            </span>
          </div>
        )}

        {isError && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            Failed to load data
          </div>
        )}

        {jsonData && !isLoading && (
          <PrettyJsonView
            json={jsonData}
            currentView={currentView}
            isLoading={false}
            showNullValues={false}
            stickyTopLevelKey={false}
            showObservationTypeBadge={true}
            scrollable={true}
            externalExpansionState={externalExpansionState}
            onExternalExpansionChange={onExternalExpansionChange}
            className="w-full [&_.border]:border-0 [&_.io-message-content]:p-0 [&_.rounded-sm]:rounded-none [&_td:first-child]:pl-6 [&_th:first-child]:pl-6 [&_th]:h-6 [&_th]:text-xs"
          />
        )}

        {!jsonData && !isLoading && !isError && (
          <div className="py-2 text-xs text-muted-foreground">
            No input/output/metadata
          </div>
        )}
      </div>
    </div>
  );
});
