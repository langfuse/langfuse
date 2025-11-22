/**
 * NavigationPanel - Left panel container with search and view switching
 *
 * Contains:
 * - NavigationHeader (fixed height search bar)
 * - View content (TraceTree | TraceSearchList | TraceTimeline)
 *
 * Auto-switches to search results when user enters query.
 */

import { useSearch } from "../../contexts/SearchContext";
import { NavigationHeader } from "./NavigationHeader";
import { TraceTree } from "../TraceTree";
import { TraceSearchList } from "../TraceSearchList";

export function NavigationPanel() {
  const { searchQuery } = useSearch();

  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div className="flex h-full flex-col border-r">
      {/* Fixed height search bar */}
      <NavigationHeader />

      {/* Scrollable content area */}
      <div className="flex-1 overflow-hidden">
        {hasQuery ? <TraceSearchList /> : <TraceTree />}
      </div>
    </div>
  );
}
