/**
 * LogViewExpandedContent - Content shown when a log view row is expanded.
 *
 * Only renders the I/O data (PrettyJsonView), not the header row.
 * The header row is handled by JSONTableView.
 */

import { memo, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type TreeNode } from "@/src/components/trace2/lib/types";
import { useLogViewObservationIO } from "./useLogViewObservationIO";

export interface LogViewExpandedContentProps {
  node: TreeNode;
  traceId: string;
  projectId: string;
  currentView?: "pretty" | "json";
  /** Optional external expansion state for JSON tree (non-virtualized mode) */
  externalExpansionState?: Record<string, boolean> | boolean;
  /** Callback when expansion state changes (non-virtualized mode) */
  onExternalExpansionChange?: (
    expansion: Record<string, boolean> | boolean,
  ) => void;
}

/**
 * Expanded content with full observation data as JSON.
 * Fetches observation data lazily when mounted.
 */
export const LogViewExpandedContent = memo(function LogViewExpandedContent({
  node,
  traceId,
  projectId,
  currentView = "pretty",
  externalExpansionState,
  onExternalExpansionChange,
}: LogViewExpandedContentProps) {
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

  return (
    <div className="w-full">
      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="ml-2 text-xs text-muted-foreground">Loading...</span>
        </div>
      )}

      {isError && (
        <div className="flex h-full w-full items-center bg-destructive/10 px-6 py-2 text-xs text-destructive">
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
        <div className="py-2 pl-6 text-xs text-muted-foreground">
          No input/output/metadata
        </div>
      )}
    </div>
  );
});
