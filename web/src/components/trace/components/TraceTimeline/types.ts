/**
 * Timeline-specific types for trace visualization
 */

import type { TreeNode } from "../../lib/types";
import type Decimal from "decimal.js";
import type { ScoreDomain } from "@langfuse/shared";
import type { WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

/**
 * Pre-computed timeline metrics for efficient rendering
 * Calculated once during tree flattening to avoid per-frame calculations
 */
export interface TimelineMetrics {
  /** Horizontal offset from trace start (in pixels) */
  startOffset: number;
  /** Width of the timeline bar (in pixels) */
  itemWidth: number;
  /** Offset for first token time marker (for streaming LLMs, in pixels) */
  firstTokenTimeOffset?: number;
  /** Duration in seconds */
  latency?: number;
}

/**
 * Props for TimelineBar component
 * Renders the gantt bar (duration) plus a trailing metric label, positioned on
 * the time axis. Hierarchy/identity (badge, name, connectors) lives in the
 * gutter (TimelineGutterRow), not here.
 */
export interface TimelineBarProps {
  node: TreeNode;
  metrics: TimelineMetrics;
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
 * Flattened timeline item for virtualized rendering
 * Extends TreeNode with timeline positioning data and tree structure metadata
 */
export interface FlatTimelineItem {
  node: TreeNode;
  depth: number;
  treeLines: boolean[];
  isLastSibling: boolean;
  // Pre-computed timeline metrics
  metrics: TimelineMetrics;
}

/**
 * Props for TimelineGutterRow component
 * Renders the left gutter: tree connectors + icon + name (the depth coordinate).
 * Identity only — time/metrics live on the bar (TimelineBar) in the chart pane.
 */
export interface TimelineGutterRowProps {
  item: FlatTimelineItem;
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
 * Renders time axis with markers
 */
export interface TimelineScaleProps {
  /** Total trace duration in seconds */
  traceDuration: number;
  /** Width of the timeline scale in pixels */
  scaleWidth: number;
  /** Step size between time markers in seconds */
  stepSize: number;
}
