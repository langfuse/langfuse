/**
 * Memoized virtual-row shells for the timeline.
 *
 * These are the render boundary that keeps playback and hover cheap: each
 * shell subscribes to its OWN row's playhead-active flag
 * (useIsObservationActive — a primitive selector), so a playback boundary
 * crossing re-renders only the rows whose glow flipped, never the whole
 * virtualized list. Every other prop is a primitive or a reference the parent
 * keeps stable (the flattenedItems memo, useCallback handlers, the
 * scores-by-node map), so scroll/hover/selection reconciliation bails out here
 * for unaffected rows.
 */

import { memo } from "react";
import type Decimal from "decimal.js";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { type TreeNode } from "../../types/treeNode";
import { type TimelineRowNode } from "./types";
import { type TextMeasurer } from "../../fns/timeline/textMeasurer";
import { type Density } from "../../fns/timeline/density";
import { TimelineGutterRow } from "./TimelineGutterRow";
import { TimelineBar } from "./TimelineBar";
import { useIsObservationActive } from "@/src/features/traces/contexts/PlayheadContext";
import { cn } from "@/src/utils/tailwind";

interface RowShellSharedProps {
  row: TimelineRowNode;
  /** Virtual row offset/extent — primitives so the memo can bail on scroll. */
  top: number;
  height: number;
  isSelected: boolean;
  isHovered: boolean;
  /** Stable id/node-taking callbacks created once in the parent. */
  onSelect: (nodeId: string) => void;
  onHover: (node: TreeNode) => void;
}

type GutterRowShellProps = RowShellSharedProps & {
  hasChildren: boolean;
  isCollapsed: boolean;
  /** Indentation cap from the gutter width (see visual-depth.ts). */
  maxVisualDepth: number;
  onToggleCollapse: (nodeId: string) => void;
};

function TimelineGutterRowShellComponent({
  row,
  top,
  height,
  isSelected,
  isHovered,
  hasChildren,
  isCollapsed,
  maxVisualDepth,
  onSelect,
  onHover,
  onToggleCollapse,
}: GutterRowShellProps) {
  const nodeId = row.node.id;
  // Playhead glow: rows "playing" at the current time light UP (accent tint).
  const isActive = useIsObservationActive(nodeId);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: `${height}px`,
        transform: `translateY(${top}px)`,
      }}
      className={cn(
        "transition-colors duration-150",
        isActive && "bg-primary-accent/15",
      )}
    >
      <TimelineGutterRow
        row={row}
        isSelected={isSelected}
        isHovered={isHovered}
        onSelect={() => onSelect(nodeId)}
        onHover={() => onHover(row.node)}
        onToggleCollapse={() => onToggleCollapse(nodeId)}
        hasChildren={hasChildren}
        isCollapsed={isCollapsed}
        maxVisualDepth={maxVisualDepth}
      />
    </div>
  );
}

export const TimelineGutterRowShell = memo(TimelineGutterRowShellComponent);

type ChartRowShellProps = RowShellSharedProps & {
  width: number;
  showDuration: boolean;
  showCostTokens: boolean;
  showScores: boolean;
  showComments: boolean;
  colorCodeMetrics: boolean;
  parentTotalCost?: Decimal;
  parentTotalDuration?: number;
  commentCount: number;
  nodeScores: WithStringifiedMetadata<ScoreDomain>[];
  measurer: TextMeasurer;
  density: Density;
};

function TimelineChartRowShellComponent({
  row,
  top,
  height,
  width,
  isSelected,
  isHovered,
  showDuration,
  showCostTokens,
  showScores,
  showComments,
  colorCodeMetrics,
  parentTotalCost,
  parentTotalDuration,
  commentCount,
  nodeScores,
  measurer,
  density,
  onSelect,
  onHover,
}: ChartRowShellProps) {
  const nodeId = row.node.id;
  const isActive = useIsObservationActive(nodeId);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: `${width}px`,
        height: `${height}px`,
        transform: `translateY(${top}px)`,
      }}
      className={cn(
        "cursor-pointer transition-colors duration-150",
        // Selected = accent tint so the neutral bar (bg-muted) stays visible
        // against the row; a playhead-active row glows with the same accent;
        // hover stays neutral.
        isSelected
          ? "bg-primary-accent/10"
          : isActive
            ? "bg-primary-accent/15"
            : isHovered
              ? "bg-muted"
              : "",
      )}
      onClick={() => onSelect(nodeId)}
      onMouseEnter={() => onHover(row.node)}
    >
      <TimelineBar
        row={row}
        laneWidth={width}
        measurer={measurer}
        density={density}
        isSelected={isSelected}
        isHovered={isHovered}
        showDuration={showDuration}
        showCostTokens={showCostTokens}
        showScores={showScores}
        showComments={showComments}
        colorCodeMetrics={colorCodeMetrics}
        parentTotalCost={parentTotalCost}
        parentTotalDuration={parentTotalDuration}
        commentCount={commentCount}
        scores={nodeScores}
      />
    </div>
  );
}

export const TimelineChartRowShell = memo(TimelineChartRowShellComponent);
