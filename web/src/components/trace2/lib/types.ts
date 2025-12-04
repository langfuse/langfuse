/**
 * Core types for trace component tree structure.
 *
 * TreeNode: Unified node type representing both traces and observations in a hierarchical tree.
 * TraceSearchListItem: Flattened representation of tree nodes for search/list views.
 */

import { type ObservationType } from "@langfuse/shared";
import type Decimal from "decimal.js";

/**
 * Unified tree node type for trace tree component.
 * Represents both TRACE root nodes and OBSERVATION child nodes.
 */
export type TreeNode = {
  id: string;
  type: "TRACE" | ObservationType;
  name: string;
  startTime: Date;
  endTime?: Date | null;
  level?: string;
  children: TreeNode[];
  // Token usage
  inputUsage?: number | null;
  outputUsage?: number | null;
  totalUsage?: number | null;
  // Per-node cost from API
  calculatedInputCost?: number | null;
  calculatedOutputCost?: number | null;
  calculatedTotalCost?: number | null;
  // Pre-computed cost for this node + all descendants
  // Calculated bottom-up during tree construction for O(1) access
  totalCost?: Decimal;
  // Trace-specific properties (when type === 'TRACE')
  latency?: number;
  // Observation-specific properties (when type !== 'TRACE')
  parentObservationId?: string | null;
  traceId?: string;
  // Temporal and structural properties
  /** Milliseconds from trace start to this node's start time */
  startTimeSinceTrace: number;
  /** Milliseconds from parent's start to this node's start (null for root observations or trace root) */
  startTimeSinceParentStart: number | null;
  /** Tree depth: -1 for trace root, 0 for root observations, increases with nesting */
  depth: number;
  /** Maximum depth of subtree rooted at this node (0 for leaf nodes) */
  childrenDepth: number;
};

/**
 * Flattened tree node for search list and virtualized rendering.
 * Contains parent-level totals for heatmap color scaling.
 */
export interface TraceSearchListItem {
  node: TreeNode;
  /** Root-level total cost for heatmap scaling */
  parentTotalCost?: Decimal;
  /** Root-level total duration for heatmap scaling */
  parentTotalDuration?: number;
  /** Observation ID for navigation (undefined for TRACE nodes) */
  observationId?: string;
}
