/**
 * Timeline-specific tree flattening with pre-computed metrics.
 * Extends base tree flattening to include timeline positioning calculations.
 */

import { type TreeNode } from "../../lib/types";
import { type FlatTimelineItem, type TimelineMetrics } from "./types";
import {
  calculateTimelineOffset,
  calculateTimelineWidth,
  SCALE_WIDTH,
} from "./timeline-calculations";

/**
 * Flattens tree into list for timeline virtualized rendering.
 * Pre-computes timeline metrics (offset, width) during flattening for performance.
 *
 * Uses iterative approach to avoid stack overflow with deep trees.
 *
 * @param roots - Root nodes to flatten (supports multiple roots)
 * @param collapsedNodes - Set of node IDs that are collapsed
 * @param traceStartTime - When the trace started (for offset calculation)
 * @param totalScaleSpan - Total duration of the trace in seconds
 * @param scaleWidth - Width of the timeline scale in pixels (default: SCALE_WIDTH)
 * @returns Flat list of nodes with timeline metrics
 */
export function flattenTreeWithTimelineMetrics(
  roots: TreeNode[],
  collapsedNodes: Set<string>,
  traceStartTime: Date,
  totalScaleSpan: number,
  scaleWidth: number = SCALE_WIDTH,
): FlatTimelineItem[] {
  if (roots.length === 0) return [];

  const flatList: FlatTimelineItem[] = [];

  // Sort roots by startTime
  const sortedRoots = [...roots].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );

  // Initialize stack with all roots at depth 0 (in reverse order for correct DFS)
  const stack: Array<{
    node: TreeNode;
    depth: number;
    treeLines: boolean[];
    isLastSibling: boolean;
  }> = [];

  for (let i = sortedRoots.length - 1; i >= 0; i--) {
    stack.push({
      node: sortedRoots[i]!,
      depth: 0,
      treeLines: [],
      isLastSibling: i === sortedRoots.length - 1,
    });
  }

  // Process stack (LIFO - depth-first traversal)
  while (stack.length > 0) {
    const current = stack.pop()!;
    const currentNode = current.node;

    // Pre-compute timeline metrics ONCE during flattening
    const latency = currentNode.endTime
      ? (currentNode.endTime.getTime() - currentNode.startTime.getTime()) / 1000
      : undefined;

    const startOffset = calculateTimelineOffset(
      currentNode.startTime,
      traceStartTime,
      totalScaleSpan,
      scaleWidth,
    );

    const itemWidth = calculateTimelineWidth(
      latency ?? 0,
      totalScaleSpan,
      scaleWidth,
    );

    // Handle first token time for streaming LLMs (completionStartTime)
    // This is stored on observations that have streaming responses
    const firstTokenTimeOffset =
      "completionStartTime" in currentNode &&
      currentNode.completionStartTime instanceof Date
        ? calculateTimelineOffset(
            currentNode.completionStartTime,
            traceStartTime,
            totalScaleSpan,
            scaleWidth,
          )
        : undefined;

    const metrics: TimelineMetrics = {
      startOffset,
      itemWidth,
      firstTokenTimeOffset,
      latency,
    };

    // Add current node to result
    flatList.push({
      node: currentNode,
      depth: current.depth,
      treeLines: current.treeLines,
      isLastSibling: current.isLastSibling,
      metrics,
    });

    // If node has children and is not collapsed, add children to stack
    if (
      currentNode.children.length > 0 &&
      !collapsedNodes.has(currentNode.id)
    ) {
      // Sort children by startTime (chronological order)
      const sortedChildren = [...currentNode.children].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime(),
      );

      // Push children in REVERSE order to maintain left-to-right DFS traversal
      // (stack is LIFO, so last pushed = first popped)
      for (let i = sortedChildren.length - 1; i >= 0; i--) {
        const child = sortedChildren[i];
        const isChildLast = i === sortedChildren.length - 1;

        stack.push({
          node: child,
          depth: current.depth + 1,
          treeLines: [...current.treeLines, !isChildLast], // Add line if not last child
          isLastSibling: isChildLast,
        });
      }
    }
  }

  return flatList;
}
