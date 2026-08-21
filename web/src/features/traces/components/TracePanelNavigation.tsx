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
import { TraceTimeline } from "./TraceTimeline/TraceTimeline";
import { TraceTimelineCompact } from "./TraceTimelineDense/TraceTimelineCompact";
import { useMemo } from "react";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";

export function TracePanelNavigation() {
  const { searchQuery } = useSearch();
  const [viewMode] = useQueryParam("view", StringParam);

  // The Compact Timeline feature preview changes what the Timeline view IS,
  // rather than adding a third mode for the user to reason about. On by default
  // for the Langfuse team (see receivesFeaturePreviewsByDefault), opt-in for
  // everyone else. `enableForAdmins: false` so a self-hosted admin does not get
  // it silently — the preview toggle is the way in.
  const isCompactTimelineEnabled = useIsFeatureEnabled("compactTimeline", {
    enableForAdmins: false,
  });
  const hasQuery = searchQuery.trim().length > 0;
  const isTimelineView = viewMode === "timeline";

  // Memoize to prevent recreation when deps haven't changed
  const content = useMemo(() => {
    // Priority: Search > Timeline > Tree
    if (hasQuery) {
      return <TraceSearchList />;
    }
    if (isTimelineView) {
      return isCompactTimelineEnabled ? (
        <TraceTimelineCompact />
      ) : (
        <TraceTimeline />
      );
    }
    return <TraceTree />;
  }, [hasQuery, isTimelineView, isCompactTimelineEnabled]);

  return content;
}
