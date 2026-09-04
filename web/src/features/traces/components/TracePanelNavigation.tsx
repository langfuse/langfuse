/**
 * TracePanelNavigation - Pure content component for navigation panel
 *
 * Responsibility:
 * - Decide which navigation view to show (Tree/Timeline/Search)
 * - The Timeline is either the classic gantt or the Compact Timeline, depending
 *   on that feature preview
 * - NO layout structure - just returns the content component
 *
 * Hooks:
 * - useSearch() - for search query state
 * - useQueryParam() - for timeline view mode
 *
 * Re-renders when:
 * - Search query changes
 * - View mode changes (timeline toggle)
 * - Does NOT re-render when selection changes (isolated)
 */

import { StringParam, useQueryParam } from "use-query-params";
import { useSearch } from "@/src/features/traces/contexts/SearchContext";
import { useTraceGraphData } from "@/src/features/traces/contexts/TraceGraphDataContext";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { TraceTree } from "./TraceTree";
import { TraceSearchList } from "./TraceSearchList";
import { TraceTimelineCompact } from "./TraceTimelineDense/TraceTimelineCompact";
import { TraceGraphView } from "./TraceGraphView/TraceGraphView";
import { TraceLanesView } from "./TraceLanesView/TraceLanesView";
import { useMemo } from "react";

export function TracePanelNavigation() {
  const { searchQuery } = useSearch();
  const { isGraphViewAvailable } = useTraceGraphData();
  const [viewMode] = useQueryParam("view", StringParam);
  const projectId = useProjectIdFromURL();
  const isLanesEnabled = useIsFeatureEnabled("laneTimelineView", {
    projectId: projectId as string,
  });

  const hasQuery = searchQuery.trim().length > 0;
  const isTimelineView = viewMode === "timeline";
  // A stale ?view=graph URL on a trace without graph data falls back to tree.
  const isGraphView = viewMode === "graph" && isGraphViewAvailable;
  const isLanesView = viewMode === "lanes" && isLanesEnabled;

  // Memoize to prevent recreation when deps haven't changed
  const content = useMemo(() => {
    // Priority: Search > Graph > Lanes > Timeline > Tree
    if (hasQuery) {
      return <TraceSearchList />;
    }
    if (isGraphView) {
      return <TraceGraphView />;
    }
    if (isLanesView) {
      // Lanes are an overview, not a replacement: the tree stays beneath them
      // so selection and drill-down keep their usual home.
      return (
        <div className="flex h-full flex-col overflow-hidden">
          <div className="border-border shrink-0 border-b pb-2">
            <TraceLanesView />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden pt-2">
            <TraceTree />
          </div>
        </div>
      );
    }
    if (isTimelineView) {
      return <TraceTimelineCompact />;
    }
    return <TraceTree />;
  }, [hasQuery, isGraphView, isLanesView, isTimelineView]);

  return content;
}
