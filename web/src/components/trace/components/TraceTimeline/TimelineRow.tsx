/**
 * TimelineRow - One waterfall row: a fixed left gutter (hierarchy) + a time track.
 *
 * The split is the whole point. Hierarchy and time are two different horizontal
 * coordinate systems, so they get two regions instead of being crammed onto one
 * axis (which is what made the connectors "dead" — the depth-indented elbow and
 * the time-offset bar drifted apart by the node's start time):
 *
 *  - Gutter (depth coordinate): connectors + chevron + badge + name. Indented by
 *    depth, so the connectors always reach the badge they point at. Sticky-left
 *    so identity stays visible while the track scrolls horizontally.
 *  - Track (time coordinate): the gantt bar at its start offset (see TimelineBar).
 *
 * Connector geometry is derived from the row's vertical center (top-1/2), and the
 * guide columns span the full row height so each row's guides meet the next row's
 * — the lines and the badge share one geometry instead of hardcoded offsets.
 */

import { type TimelineRowProps } from "./types";
import { TimelineBar } from "./TimelineBar";
import { ItemBadge } from "@/src/components/ItemBadge";
import { ChevronRight } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

const TREE_INDENTATION = 14; // pixels per depth level

export function TimelineRow({
  item,
  isSelected,
  onSelect,
  onHover,
  onToggleCollapse,
  hasChildren,
  isCollapsed,
  gutterWidth,
  trackWidth,
  showDuration,
  showCostTokens,
  showScores,
  showComments,
  colorCodeMetrics,
  parentTotalCost,
  parentTotalDuration,
  commentCount,
  scores,
}: TimelineRowProps) {
  const { node, depth, treeLines, isLastSibling, metrics } = item;

  return (
    <div
      className={cn(
        "group flex h-full w-full cursor-pointer",
        isSelected ? "bg-muted" : "hover:bg-muted/50",
      )}
      onClick={onSelect}
      onMouseEnter={onHover}
    >
      {/* Gutter: hierarchy in the depth coordinate. Sticky-left + opaque so it
          stays pinned (and masks bars) while the track scrolls horizontally. */}
      <div
        className={cn(
          "border-border/60 sticky left-0 z-10 flex h-full shrink-0 items-center border-r pr-2",
          isSelected ? "bg-muted" : "bg-background group-hover:bg-muted",
        )}
        style={{ width: `${gutterWidth}px` }}
      >
        {depth > 0 && (
          <div className="flex h-full shrink-0">
            {/* Ancestor guides: full-height verticals for ancestors whose
                subtree continues below this row. */}
            {Array.from({ length: depth - 1 }, (_, i) => (
              <div
                key={i}
                className="relative h-full"
                style={{ width: `${TREE_INDENTATION}px` }}
              >
                {treeLines[i] && (
                  <div className="bg-border absolute inset-y-0 left-1.5 w-px" />
                )}
              </div>
            ))}

            {/* Current-level connector: vertical down to the elbow (last child)
                or full height (joins the next sibling's connector), plus the
                elbow at the row's vertical center where the badge sits. */}
            <div
              className="relative h-full shrink-0"
              style={{ width: `${TREE_INDENTATION}px` }}
            >
              <div
                className={cn(
                  "bg-border absolute top-0 left-1.5 w-px",
                  isLastSibling ? "h-1/2" : "bottom-0",
                )}
              />
              <div className="bg-border absolute top-1/2 left-1.5 h-px w-2.5" />
            </div>
          </div>
        )}

        {/* Badge sits right after the connectors so the elbow always meets it
            (leaf and parent rows alike); name fills the rest and truncates. */}
        <ItemBadge type={node.type} isSmall className="mr-1 ml-0.5 shrink-0" />
        <span
          className="text-primary min-w-0 flex-1 truncate text-xs font-medium"
          title={node.name}
        >
          {node.name || `Unnamed ${node.type.toLowerCase()}`}
        </span>

        {/* Expand/collapse caret, pinned right (as in the tree view). */}
        {hasChildren && (
          <button
            type="button"
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            aria-expanded={!isCollapsed}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            className="hover:bg-muted-foreground/10 ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded"
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                !isCollapsed && "rotate-90",
              )}
            />
          </button>
        )}
      </div>

      {/* Track: gantt bar in the time coordinate. */}
      <div
        className="relative h-full shrink-0"
        style={{ width: `${trackWidth}px` }}
      >
        <TimelineBar
          node={node}
          metrics={metrics}
          isSelected={isSelected}
          showDuration={showDuration}
          showCostTokens={showCostTokens}
          showScores={showScores}
          showComments={showComments}
          colorCodeMetrics={colorCodeMetrics}
          parentTotalCost={parentTotalCost}
          parentTotalDuration={parentTotalDuration}
          commentCount={commentCount}
          scores={scores}
        />
      </div>
    </div>
  );
}
