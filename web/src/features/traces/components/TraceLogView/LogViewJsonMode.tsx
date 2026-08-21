/**
 * LogViewJsonMode - Renders all observations as a single JSON view.
 *
 * Used when currentView="json" to display all observation data
 * as one concatenated JSON object instead of the table view.
 *
 * Reuses the existing JSONView component from CodeJsonViewer.tsx.
 */

import { memo, useEffect, useMemo } from "react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { type FlatLogItem } from "./log-view-types";
import { useLogViewAllObservationsIO } from "./useLogViewAllObservationsIO";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { countJsonRows } from "@/src/features/traces/components/AdvancedJsonViewer/utils/rowCount";
import { LargeJsonFieldFallback } from "@/src/features/traces/components/IOPreview/components/LargeJsonFieldFallback";
import {
  JSON_VIEW_RENDER_CHAR_LIMIT,
  JSON_VIEW_RENDER_ROW_LIMIT,
  probeJsonField,
} from "@/src/features/traces/components/IOPreview/fns/jsonViewSizeGate";

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

  // Size gate (same class of bug as LFE-10989/LFE-10847, fixed for the
  // per-field trace I/O views): `data` here concatenates EVERY observation's
  // input/output/metadata into one object handed to the unvirtualized
  // react18-json-view. The `!isVirtualized` gate in TraceLogView.tsx only
  // bounds how many observations can reach this component (< 350) — it does
  // nothing about how large any of them are, so a trace with a moderate
  // observation count but verbose I/O (long agent/RAG contexts) still freezes
  // the tab here. Probe the combined payload once it loads and, above the
  // limit, show the bounded fallback + download instead of the live tree.
  const probe = useMemo(() => (data ? probeJsonField(data) : null), [data]);
  const rowCount = useMemo(() => (data ? countJsonRows(data) : 0), [data]);
  const tooLarge = Boolean(
    probe &&
    (probe.size > JSON_VIEW_RENDER_CHAR_LIMIT ||
      rowCount > JSON_VIEW_RENDER_ROW_LIMIT),
  );

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
      {data && !isLoading && tooLarge && probe && (
        <div className="flex-1 overflow-y-auto p-2">
          <LargeJsonFieldFallback
            title="All observations"
            serialized={probe.serialized}
            isString={probe.isString}
            charCount={probe.size}
            rowCount={
              rowCount > JSON_VIEW_RENDER_ROW_LIMIT ? rowCount : undefined
            }
            downloadFileBase={`observations-${traceId}`}
          />
        </div>
      )}

      {data && !isLoading && !tooLarge && (
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
