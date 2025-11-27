/**
 * TracePanelNavigation - Pure content component for navigation panel
 *
 * Responsibility:
 * - Decide which navigation view to show (Tree/Timeline/Search)
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
import { useSearch } from "../../contexts/SearchContext";
import { TraceTree } from "../TraceTree";
import { TraceSearchList } from "../TraceSearchList";
import { TraceTimeline } from "../TraceTimeline";
import { useMemo } from "react";

export function TracePanelNavigation() {
  const { searchQuery } = useSearch();
  const [viewMode] = useQueryParam("view", StringParam);

  const hasQuery = searchQuery.trim().length > 0;
  const isTimelineView = viewMode === "timeline";

  // Memoize to prevent recreation when deps haven't changed
  const content = useMemo(() => {
    // Priority: Search > Timeline > Tree
    if (hasQuery) {
      return <TraceSearchList />;
    }
    if (isTimelineView) {
      return <TraceTimeline />;
    }
    return <TraceTree />;
  }, [hasQuery, isTimelineView]);

  return content;
}
