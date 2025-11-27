/**
 * LogViewStickyHeader - Sticky header showing the topmost visible observation.
 *
 * Displays observation info at the top of the log view, fixed position.
 * Updates as the user scrolls through the virtualized list.
 */

import { memo } from "react";
import { ItemBadge } from "@/src/components/ItemBadge";
import { type FlatLogItem } from "./log-view-types";
import {
  formatDisplayName,
  formatRelativeTime,
  formatDuration,
} from "./log-view-formatters";

export interface LogViewStickyHeaderProps {
  /** The topmost visible item, or null if none */
  item: FlatLogItem | null;
  /** Total count of items in the list */
  totalCount: number;
  /** Current index (0-based) of the topmost visible item */
  currentIndex: number;
}

/**
 * Sticky header that shows the topmost visible observation.
 * Provides context as users scroll through long lists.
 */
export const LogViewStickyHeader = memo(function LogViewStickyHeader({
  item,
  totalCount,
  currentIndex,
}: LogViewStickyHeaderProps) {
  // Don't render if no item or empty list
  if (!item || totalCount === 0) {
    return null;
  }

  const displayName = formatDisplayName(item.node);
  const relativeTime = formatRelativeTime(item.node.startTimeSinceTrace);
  const duration = formatDuration(item.node.startTime, item.node.endTime);

  return (
    <div className="sticky top-0 z-10 flex min-h-6 items-center gap-2 border-b border-border bg-background/95 px-3 py-0.5 pr-6 backdrop-blur-sm">
      {/* Position indicator */}
      <span className="flex-shrink-0 text-xs text-muted-foreground">
        {currentIndex + 1} / {totalCount}
      </span>

      {/* Type badge */}
      <ItemBadge type={item.node.type} isSmall />

      {/* Name */}
      <span className="min-w-0 flex-1 truncate text-xs">{displayName}</span>

      {/* Right-aligned columns: Depth, Duration, Time */}
      <span className="w-12 flex-shrink-0 text-right text-xs text-muted-foreground">
        {item.node.depth >= 0 ? `L${item.node.depth}` : "-"}
      </span>
      <span className="w-16 flex-shrink-0 text-right text-xs text-muted-foreground">
        {duration}
      </span>
      <span className="w-12 flex-shrink-0 text-right text-xs text-muted-foreground">
        {relativeTime}
      </span>
    </div>
  );
});
