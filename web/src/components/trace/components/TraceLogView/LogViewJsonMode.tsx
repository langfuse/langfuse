/**
 * LogViewJsonMode - Renders all observations as a single JSON view.
 *
 * Used when currentView="json" to display all observation data
 * as one concatenated JSON object instead of the table view.
 *
 * Reuses the existing JSONView component from CodeJsonViewer.tsx.
 */

import { memo, useEffect } from "react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { type FlatLogItem } from "./log-view-types";
import { useLogViewAllObservationsIO } from "./useLogViewAllObservationsIO";
import Spinner from "@/src/components/design-system/Spinner/Spinner";

export interface LogViewJsonModeProps {
  items: FlatLogItem[];
  traceId: string;
  projectId: string;
  /** Whether JSON view is collapsed */
  isCollapsed: boolean;
  /** Callback to toggle collapse state */
  onToggleCollapse: () => void;
}

/**
 * Renders all observations as a single JSON object.
 * Fetches all observation I/O data and combines into one view.
 */
export const LogViewJsonMode = memo(function LogViewJsonMode({
  items,
  traceId,
  projectId,
  isCollapsed,
  onToggleCollapse,
}: LogViewJsonModeProps) {
  const { data, isLoading, isError, loadAllData, totalCount } =
    useLogViewAllObservationsIO({
      items,
      traceId,
      projectId,
    });

  // Auto-load data when JSON mode is rendered
  useEffect(() => {
    if (!data && !isLoading && !isError) {
      loadAllData();
    }
  }, [data, isLoading, isError, loadAllData]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="md" variant="muted" />
          <span className="text-muted-foreground ml-2 text-sm">
            Loading observations (0/{totalCount})...
          </span>
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="border-destructive/50 bg-destructive/10 text-destructive rounded border p-4 text-sm">
            Failed to load observation data
          </div>
        </div>
      )}

      {/* JSON view */}
      {/*
        The `flex-1 overflow-y-auto` wrapper is the single owner of the bounded
        vertical scroll. JSONView must therefore render at its natural content
        height — passing `h-full`/`min-h-full` would clamp it to the wrapper's
        visible height (JSONView's root carries `max-h-full min-h-0`), leaving
        no overflow and making tall JSON unscrollable (LFE-10513).
      */}
      {data && !isLoading && (
        <div className="flex-1 overflow-y-auto">
          <JSONView
            json={data}
            scrollable={false}
            externalJsonCollapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
            className="[&_.io-message-content]:border-none"
          />
        </div>
      )}

      {/* Empty state */}
      {!data && !isLoading && !isError && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-muted-foreground text-sm">
            No observation data available
          </div>
        </div>
      )}
    </div>
  );
});
