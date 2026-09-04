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
import { TraceTree } from "./TraceTree";
import { TraceSearchList } from "./TraceSearchList";
import { TraceTimelineCompact } from "./TraceTimelineDense/TraceTimelineCompact";
import { TraceGraphView } from "./TraceGraphView/TraceGraphView";
import { useMemo } from "react";

export function TracePanelNavigation() {
  const { searchQuery } = useSearch();
  const { isGraphViewAvailable } = useTraceGraphData();
  const [viewMode] = useQueryParam("view", StringParam);

  const hasQuery = searchQuery.trim().length > 0;
  const isTimelineView = viewMode === "timeline";
  // A stale ?view=graph URL on a trace without graph data falls back to tree.
  const isGraphView = viewMode === "graph" && isGraphViewAvailable;

  // Memoize to prevent recreation when deps haven't changed
  const content = useMemo(() => {
    // Priority: Search > Graph > Timeline > Tree
    if (hasQuery) {
      return <TraceSearchList />;
    }
    if (isGraphView) {
      return <TraceGraphView />;
    }
    if (isTimelineView) {
      return <TraceTimelineCompact />;
    }
    return <TraceTree />;
  }, [hasQuery, isGraphView, isTimelineView]);

  return content;
}
