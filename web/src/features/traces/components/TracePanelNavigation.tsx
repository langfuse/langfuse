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
import { TraceTree } from "./TraceTree";
import { TraceSearchList } from "./TraceSearchList";
import { TraceTimelineCompact } from "./TraceTimelineDense/TraceTimelineCompact";
import { useMemo } from "react";

export function TracePanelNavigation() {
  const { searchQuery } = useSearch();
  const [viewMode] = useQueryParam("view", StringParam);

  const hasQuery = searchQuery.trim().length > 0;
  const isTimelineView = viewMode === "timeline";

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
    if (isTimelineView) {
      return <TraceTimelineCompact />;
    }
    if (hasQuery) {
      return <TraceSearchList />;
    }
    return <TraceTree />;
  }, [hasQuery, isTimelineView]);

  return content;
}
