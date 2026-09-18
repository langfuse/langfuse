/**
 * TracePanelNavigation - Pure content component for navigation panel
 *
 * Responsibility:
 * - Decide which navigation view to show (Tree/Timeline/Graph/Messages/Search)
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
import { TraceMessagesView } from "./TraceMessagesView/TraceMessagesView";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { useMemo } from "react";

export function TracePanelNavigation() {
  const { searchQuery } = useSearch();
  const { isGraphViewAvailable, isLoading: isGraphLoading } =
    useTraceGraphData();
  const [viewMode] = useQueryParam("view", StringParam);
  const messagesEnabled = useIsFeatureEnabled("traceMessages");

  const hasQuery = searchQuery.trim().length > 0;
  const isTimelineView = viewMode === "timeline";
  // Internal preview; a stale ?view=messages falls back to tree for others.
  const isMessagesView = viewMode === "messages" && messagesEnabled;
  // Availability is false while the graph query loads, so hold the view until it
  // resolves. Stale ?view=graph then falls back to tree.
  const isGraphView =
    viewMode === "graph" && (isGraphViewAvailable || isGraphLoading);

  // Memoize to prevent recreation when deps haven't changed
  const content = useMemo(() => {
    // The Timeline answers a query IN PLACE — matching bars keep their colour
    // and the rest dim — so it is not replaced by the flat result list. Losing
    // the chart was the thing that made searching in the Timeline feel like
    // leaving it: the one view whose whole point is where in time a span sits
    // gave that up the moment you typed.
    //
    // The Tree still hands a query to the flat list; highlighting it is its own
    // change.
    if (isMessagesView) {
      return <TraceMessagesView />;
    }
    if (isGraphView) {
      return <TraceGraphView />;
    }
    if (isTimelineView) {
      return <TraceTimelineCompact />;
    }
    if (hasQuery) {
      return <TraceSearchList />;
    }
    return <TraceTree />;
  }, [hasQuery, isGraphView, isMessagesView, isTimelineView]);

  return content;
}
