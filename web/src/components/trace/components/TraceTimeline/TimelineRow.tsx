/**
 * TimelineRow - One waterfall row: a fixed left gutter (hierarchy) + a time track.
 *
 * Hierarchy (depth) and time (gantt) are two different horizontal coordinate
 * systems, so they get two regions instead of being crammed onto one axis (which
 * is what made the connectors drift away from the bars):
 *
 *  - Gutter (depth coordinate): connectors + badge + name + caret. Sticky-left so
 *    identity stays visible while the track scrolls horizontally.
 *  - Track (time coordinate): the gantt bar at its start offset (see TimelineBar).
 *
 * The connectors are drawn as absolute lines at computed rail positions rather
 * than nested boxes, so a parent's downward stub lands on exactly the same x as
 * its children's verticals. Each parent→child line is two segments — the parent
 * draws center→bottom, the child draws top→center — meeting at the shared row
 * boundary, so the line is continuous at every depth.
 */

import { type TimelineRowProps } from "./types";
import { TimelineBar } from "./TimelineBar";
import { ItemBadge } from "@/src/components/ItemBadge";
import { ChevronRight } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

const INDENT = 14; // px per depth level
const RAIL = 7; // x of a level's vertical rail within its indent step
const CONTENT_GAP = 4; // gap from a node's rail to its badge

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

  // x of this node's own rail (where its children hang) and its parent's rail.
  const ownRailX = depth * INDENT + RAIL;
  const parentRailX = (depth - 1) * INDENT + RAIL;
  const showsChildSpine = hasChildren && !isCollapsed;
  const contentLeft = depth > 0 ? ownRailX + CONTENT_GAP : CONTENT_GAP;

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
          "relative z-10 flex h-full shrink-0 items-center pr-2",
          isSelected ? "bg-muted" : "bg-background group-hover:bg-muted",
        )}
        style={{ width: `${gutterWidth}px` }}
      >
        {/* Connector rails (absolute, depth coordinate). */}
        {/* Ancestor rails: continue through this row for ancestors that still
            have siblings below. */}
        {treeLines
          .slice(0, Math.max(0, depth - 1))
          .map((continues, level) =>
            continues ? (
              <div
                key={level}
                className="bg-border absolute inset-y-0 w-px"
                style={{ left: `${level * INDENT + RAIL}px` }}
              />
            ) : null,
          )}

        {depth > 0 && (
          <>
            {/* This node's vertical off the parent rail: top→center (last child)
                or full height (a sibling continues below). */}
            <div
              className={cn(
                "bg-border absolute top-0 w-px",
                isLastSibling ? "h-1/2" : "bottom-0",
              )}
              style={{ left: `${parentRailX}px` }}
            />
            {/* Elbow: parent rail → badge, at the row's vertical center. */}
            <div
              className="bg-border absolute top-1/2 h-px"
              style={{
                left: `${parentRailX}px`,
                width: `${INDENT + CONTENT_GAP}px`,
              }}
            />
          </>
        )}

        {/* Downward stub to this node's children: center→bottom on its own rail,
            so the first child's top→center vertical continues it seamlessly. */}
        {showsChildSpine && (
          <div
            className="bg-border absolute top-1/2 bottom-0 w-px"
            style={{ left: `${ownRailX}px` }}
          />
        )}

        {/* Content: badge + name, offset past the connectors. */}
        <div
          className="flex min-w-0 flex-1 items-center"
          style={{ paddingLeft: `${contentLeft}px` }}
        >
          <ItemBadge type={node.type} isSmall className="mr-1 shrink-0" />
          <span
            className="text-primary min-w-0 flex-1 truncate text-xs font-medium"
            title={node.name}
          >
            {node.name || `Unnamed ${node.type.toLowerCase()}`}
          </span>
        </div>

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
