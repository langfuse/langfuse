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
    <div className="group my-0.5 flex w-full min-w-fit cursor-pointer flex-row items-center">
      {/* Tree lines for ancestor levels (depth - 1) */}
      {depth > 0 && (
        <div className="flex flex-shrink-0">
          {Array.from({ length: depth - 1 }, (_, i) => (
            <div
              key={i}
              className="relative"
              style={{ width: `${TREE_INDENTATION}px` }}
            >
              {treeLines[i] && (
                <div className="absolute bottom-0 left-1.5 top-0 w-px bg-border" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Current level tree connector */}
      {depth > 0 && (
        <div
          className="relative flex-shrink-0"
          style={{ width: `${TREE_INDENTATION}px` }}
        >
          {/* Vertical line up */}
          <div
            className={cn(
              "absolute left-1.5 top-0 w-px bg-border",
              isLastSibling ? "h-3" : "bottom-0",
            )}
          />
          {/* Horizontal line to content */}
          <div className="absolute left-1.5 top-3 h-px w-2 bg-border" />
        </div>
      )}

      {/* Expand/collapse button (if has children) */}
      {hasChildren && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          className="absolute z-10 rounded hover:bg-muted"
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
