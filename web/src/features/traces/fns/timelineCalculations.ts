/**
 * Trace-level time bounds, shared by every trace view.
 *
 * Positioning is NOT here: bar, label and tick coordinates come from the pure
 * `layout()` in ./timeline, which takes the measured pixel box. This module used
 * to own a `SCALE_WIDTH = 900` constant passed as a DEFAULT PARAMETER to four
 * positioning helpers, so the measured box never reached the math and any lane
 * narrower than 900px pushed part of the trace off-screen.
 */

import { type TreeNode } from "@/src/features/traces/types/treeNode";

/**
 * Find the earliest start time across the whole tree (roots + all descendants).
 *
 * This is the timeline origin (the 0s mark). It must be the minimum start time
 * over the entire tree, not just the roots: a child observation can start
 * before its root (the TRACE wrapper's start time is the trace's own timestamp,
 * which may be later than the first observation). Anchoring the origin to the
 * roots alone pushes the 0s mark past such early children, giving them negative
 * offsets and misaligning the whole gantt.
 *
 * @param roots - Root nodes of the trace tree
 * @returns Earliest start time across the tree, or `null` when there are no nodes
 */
export function findEarliestStartTime(roots: TreeNode[]): Date | null {
  if (roots.length === 0) return null;

  let earliest = Infinity;

  // Iterative DFS to avoid stack overflow on deep trees.
  const stack: TreeNode[] = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const start = node.startTime.getTime();
    if (start < earliest) earliest = start;
    for (const child of node.children) {
      stack.push(child);
    }
  }

  return new Date(earliest);
}

/**
 * Total span of the timeline scale, in seconds.
 *
 * Measured from the timeline origin (the earliest start across the whole tree,
 * see findEarliestStartTime) to the latest end across the tree, so every bar
 * fits within the scale even when the origin sits before a root's start.
 *
 * When end times are unavailable, `endTime ?? startTime` collapses
 * `spanFromEnds` to the earliest-to-latest start gap. We therefore also
 * consider each root's latency-based span, but measured FROM THE ORIGIN: a
 * root's bar spans `(root.startTime − origin) + latency`, not just `latency`.
 * Anchoring the latency fallback to the origin keeps the root's bar inside the
 * axis when it starts after an earlier child (otherwise the bar overruns the
 * last tick by the dropped `(root.startTime − origin)` offset).
 *
 * @param roots - Root nodes of the trace tree
 * @param origin - Timeline origin (earliest start across the tree)
 * @returns Total scale span in seconds (0 when there are no roots)
 */
export function calculateTraceDuration(
  roots: TreeNode[],
  origin: Date,
): number {
  if (roots.length === 0) return 0;

  const originMs = origin.getTime();
  let latestEndMs = -Infinity;

  // Iterative DFS to avoid stack overflow on deep trees.
  const stack: TreeNode[] = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const end = (node.endTime ?? node.startTime).getTime();
    if (end > latestEndMs) latestEndMs = end;
    for (const child of node.children) stack.push(child);
  }

  const spanFromEnds = (latestEndMs - originMs) / 1000;

  // Offset-aware latency fallback: each root's bar reaches
  // (offset from origin, in seconds) + (its latency, in seconds).
  const maxRootLatencySpan = Math.max(
    ...roots.map(
      (r) => (r.startTime.getTime() - originMs) / 1000 + (r.latency ?? 0),
    ),
  );

  return Math.max(spanFromEnds, maxRootLatencySpan);
}

/**
 * Scroll target that brings a selected row into view.
 *
 * Initial load centers the row; later selections scroll the minimum (above the
 * fold → align top, below → align bottom, visible → unchanged).
 *
 * Vertical only: the timeline fits the whole trace into its measured lane, so a
 * selected bar is never off to the side and there is nothing to reveal
 * horizontally. Pure — see timelineCalculations.clienttest.ts.
 */
export function computeSelectionScrollTarget(args: {
  index: number;
  rowHeight: number;
  scrollTop: number;
  clientHeight: number;
  isInitial: boolean;
}): { top: number } {
  const { index, rowHeight, scrollTop, clientHeight, isInitial } = args;

  const rowTop = index * rowHeight;
  let top = scrollTop;
  if (isInitial) {
    top = rowTop - (clientHeight - rowHeight) / 2; // center on load
  } else if (rowTop < scrollTop) {
    top = rowTop; // above the fold → align to top
  } else if (rowTop + rowHeight > scrollTop + clientHeight) {
    top = rowTop - clientHeight + rowHeight; // below → align to bottom
  }

  return { top: Math.max(0, top) };
}
