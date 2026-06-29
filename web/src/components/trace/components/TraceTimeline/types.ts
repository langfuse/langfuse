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
 * Renders individual Gantt bar with metrics and badges
 */
export interface TimelineBarProps {
  node: TreeNode;
  metrics: TimelineMetrics;
  isSelected: boolean;
  onSelect: () => void;
  onHover?: () => void;
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
 * Props for TimelineRow component
 * Renders tree structure + timeline bar
 */
export interface TimelineRowProps {
  item: FlatTimelineItem;
  isSelected: boolean;
  onSelect: () => void;
  onHover?: () => void;
  onToggleCollapse: () => void;
  hasChildren: boolean;
  isCollapsed: boolean;
  // View preferences
  showDuration: boolean;
  showCostTokens: boolean;
  showScores: boolean;
  showComments: boolean;
  colorCodeMetrics: boolean;
  // Heatmap context
  parentTotalCost?: Decimal;
  parentTotalDuration?: number;
  // Optional data
  commentCount?: number;
  scores?: WithStringifiedMetadata<ScoreDomain>[];
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
