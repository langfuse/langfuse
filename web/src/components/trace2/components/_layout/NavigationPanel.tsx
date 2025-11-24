/**
 * NavigationPanel - Left panel container with search and view switching
 *
 * Contains:
 * - NavigationHeader (fixed height search bar)
 * - View content (TraceTree | TraceSearchList | TraceTimeline)
 *
 * Auto-switches to search results when user enters query.
 * Timeline view is activated via URL param ?view=timeline.
 */

import { useSearch } from "../../contexts/SearchContext";
import { NavigationHeader } from "./NavigationHeader";
import { HiddenObservationsNotice } from "./HiddenObservationsNotice";
import { TraceTree } from "../TraceTree";
import { TraceSearchList } from "../TraceSearchList";
import { TraceTimeline } from "../TraceTimeline";
import { StringParam, useQueryParam } from "use-query-params";

export function NavigationPanel() {
  const { searchQuery } = useSearch();
  const [viewMode] = useQueryParam("view", StringParam);

  const hasQuery = searchQuery.trim().length > 0;
  const isTimelineView = viewMode === "timeline";

  // Render logic:
  // 1. If searching, show search results
  // 2. If timeline view, show timeline
  // 3. Otherwise, show tree
  const renderContent = () => {
    if (hasQuery) {
      return <TraceSearchList />;
    }
    if (isTimelineView) {
      return <TraceTimeline />;
    }
    return <TraceTree />;
  };

  return (
    <div className="flex h-full flex-col border-r">
      {/* Fixed height search bar */}
      <NavigationHeader />

      {/* Fixed height notice (only shows when observations are hidden) */}
      <HiddenObservationsNotice />

      {/* Scrollable content area */}
      <div className="flex-1 overflow-hidden">{renderContent()}</div>
    </div>
  );
}
