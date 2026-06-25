/**
 * TimelineRow - Combines tree structure with timeline bar
 * Renders tree lines, expand button, and timeline bar positioned horizontally by time
 */

import { type TimelineRowProps } from "./types";
import { TimelineBar } from "./TimelineBar";
import { ChevronRight } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

const TREE_INDENTATION = 12; // pixels per depth level

export function TimelineRow({
  item,
  isSelected,
  onSelect,
  onHover,
  onToggleCollapse,
  hasChildren,
  isCollapsed,
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
    // h-full + items-center: the row fills its virtualized slot so the tree
    // guides below can span the full row height (and meet the adjacent rows'
    // guides), while the bar stays centered on the row's vertical midpoint.
    <div className="group flex h-full w-full min-w-fit cursor-pointer flex-row items-center">
      {/* Tree lines for ancestor levels (depth - 1) */}
      {depth > 0 && (
        <div className="flex shrink-0 self-stretch">
          {Array.from({ length: depth - 1 }, (_, i) => (
            <div
              key={i}
              className="relative"
              style={{ width: `${TREE_INDENTATION}px` }}
            >
              {treeLines[i] && (
                <div className="bg-border absolute top-0 bottom-0 left-1.5 w-px" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Current level tree connector */}
      {depth > 0 && (
        <div
          className="relative shrink-0 self-stretch"
          style={{ width: `${TREE_INDENTATION}px` }}
        >
          {/* Vertical line: down to the elbow (last child) or full height so it
              joins the next sibling's connector below. */}
          <div
            className={cn(
              "bg-border absolute top-0 left-1.5 w-px",
              isLastSibling ? "h-1/2" : "bottom-0",
            )}
          />
          {/* Elbow: horizontal connector at the row's vertical center, where the
              bar is also centered. */}
          <div className="bg-border absolute top-1/2 left-1.5 h-px w-2" />
        </div>
      )}

      {/* Expand/collapse button (if has children) */}
      {hasChildren && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          className="hover:bg-muted absolute z-10 rounded"
          style={{
            left: `${depth * TREE_INDENTATION + (metrics.startOffset > 0 ? metrics.startOffset + 4 : 4)}px`,
            top: "50%",
            transform: "translateY(-50%)",
          }}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              !isCollapsed && "rotate-90",
            )}
          />
        </button>
      )}

      {/* Timeline bar */}
      <TimelineBar
        node={node}
        metrics={metrics}
        isSelected={isSelected}
        onSelect={onSelect}
        onHover={onHover}
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
  );
}
