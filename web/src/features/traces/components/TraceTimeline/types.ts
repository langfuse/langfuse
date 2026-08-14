/**
 * Timeline-specific types for trace visualization
 *
 * Geometry is not here: every coordinate comes from `PositionedNode`, produced
 * by the pure `layout()` in fns/timeline. These types only describe what the
 * row components need on top of it.
 */

import type { TreeNode } from "../../types/treeNode";
import type { PositionedNode, Tick } from "../../fns/timeline/layout";
import type { TextMeasurer } from "../../fns/timeline/textMeasurer";
import type Decimal from "decimal.js";
import type { ScoreDomain } from "@langfuse/shared";
import type { WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

/** A row of the timeline, positioned against the measured lane. */
export type TimelineRowNode = PositionedNode<TreeNode>;

/**
 * Props for TimelineBar component
 * Renders the gantt bar (duration) plus a trailing metric label, positioned on
 * the time axis. Hierarchy/identity (badge, name, connectors) lives in the
 * gutter (TimelineGutterRow), not here.
 */
export interface TimelineBarProps {
  row: TimelineRowNode;
  /** Measured width of the chart lane; the cluster may not cross it. */
  laneWidth: number;
  /** Same measurer layout() used, so the bar can fit its own optional badges. */
  measurer: TextMeasurer;
  isSelected: boolean;
  /** Row is hovered (driven by shared state so the whole row highlights). */
  isHovered?: boolean;
  // View preferences
  showDuration: boolean;
  showCostTokens: boolean;
  showScores: boolean;
  showComments: boolean;
  colorCodeMetrics: boolean;
  // Heatmap context for color coding
  parentTotalCost?: Decimal;
  parentTotalDuration?: number;
  // Comment count (optional)
  commentCount?: number;
  // Scores for badges
  scores?: WithStringifiedMetadata<ScoreDomain>[];
}

/**
 * Props for TimelineGutterRow component
 * Renders the left gutter: tree connectors + icon + name (the depth coordinate).
 * Identity only — time/metrics live on the bar (TimelineBar) in the chart pane.
 */
export interface TimelineGutterRowProps {
  row: Pick<TimelineRowNode, "node" | "depth" | "treeLines" | "isLastSibling">;
  isSelected: boolean;
  /** Row is hovered (shared state so the gutter + chart highlight together). */
  isHovered?: boolean;
  onSelect: () => void;
  onHover?: () => void;
  onToggleCollapse: () => void;
  hasChildren: boolean;
  isCollapsed: boolean;
  /**
   * Deepest level to render indentation for; deeper rows render flat at this
   * level so extreme depth never clips names away (LFE-10959, see
   * _shared/visual-depth.ts). Defaults to unbounded.
   */
  maxVisualDepth?: number;
}

/**
 * Props for TimelineScale component
 * Renders the time axis from ticks the layout already placed and labelled.
 */
export interface TimelineScaleProps {
  ticks: readonly Tick[];
  /** Measured width of the chart lane. */
  laneWidth: number;
}
