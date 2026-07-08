/**
 * Pure functions for timeline calculations
 * These functions handle all timeline positioning and sizing logic
 */

import { type TreeNode } from "../../lib/types";

// Fixed widths for timeline styling
export const SCALE_WIDTH = 900;
export const STEP_SIZE = 100;

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

// Predefined step sizes for time axis (in seconds)
export const PREDEFINED_STEP_SIZES = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25,
  35, 40, 45, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500,
];

/**
 * Calculate the horizontal offset from the trace start time
 * @param nodeStartTime - When the observation started
 * @param traceStartTime - When the trace started
 * @param totalScaleSpan - Total duration of the trace in seconds
 * @param scaleWidth - Width of the timeline scale in pixels
 * @returns Horizontal offset in pixels
 */
export function calculateTimelineOffset(
  nodeStartTime: Date,
  traceStartTime: Date,
  totalScaleSpan: number,
  scaleWidth: number = SCALE_WIDTH,
): number {
  const timeFromStart =
    (nodeStartTime.getTime() - traceStartTime.getTime()) / 1000;
  return (timeFromStart / totalScaleSpan) * scaleWidth;
}

/**
 * Calculate the width of a timeline bar from duration
 * @param duration - Duration in seconds
 * @param totalScaleSpan - Total duration of the trace in seconds
 * @param scaleWidth - Width of the timeline scale in pixels
 * @returns Width of the bar in pixels
 */
export function calculateTimelineWidth(
  duration: number,
  totalScaleSpan: number,
  scaleWidth: number = SCALE_WIDTH,
): number {
  return (duration / totalScaleSpan) * scaleWidth;
}

/**
 * Calculate appropriate step size for the time axis
 * Selects from predefined step sizes to ensure readable time markers
 * @param traceDuration - Total trace duration in seconds
 * @param scaleWidth - Width of the timeline scale in pixels
 * @returns Step size in seconds
 */
export function calculateStepSize(
  traceDuration: number,
  scaleWidth: number = SCALE_WIDTH,
): number {
  const calculatedStepSize = traceDuration / (scaleWidth / STEP_SIZE);
  return (
    PREDEFINED_STEP_SIZES.find((step) => step >= calculatedStepSize) ||
    PREDEFINED_STEP_SIZES[PREDEFINED_STEP_SIZES.length - 1]
  );
}

/**
 * Get all predefined step sizes
 * Useful for testing and validation
 * @returns Array of predefined step sizes in seconds
 */
export function getPredefinedStepSizes(): number[] {
  return [...PREDEFINED_STEP_SIZES];
}

// Horizontal reveal on selection: a bar counts as visible only if it sits at
// least this far inside the viewport; when revealed, it lands this fraction
// from the left edge.
export const REVEAL_MARGIN_PX = 16;
export const REVEAL_LEFT_FRACTION = 0.2;

/**
 * Scroll target that brings a selected row fully into view on BOTH axes with a
 * single scrollTo (two competing smooth animations on one element clobber each
 * other — the vertical one re-fires as it settles and resets the horizontal).
 *
 * Vertical: initial load centers the row; later selections scroll the minimum
 * (above the fold → align top, below → align bottom, visible → unchanged).
 * Horizontal: no-op while the bar start sits comfortably in view, else land it
 * REVEAL_LEFT_FRACTION from the left edge.
 *
 * Pure — see timeline-calculations.clienttest.ts.
 */
export function computeSelectionScrollTarget(args: {
  index: number;
  rowHeight: number;
  scrollTop: number;
  scrollLeft: number;
  clientHeight: number;
  clientWidth: number;
  /** Bar start offset in content px; null = no horizontal component. */
  barStart: number | null;
  isInitial: boolean;
}): { top: number; left: number } {
  const {
    index,
    rowHeight,
    scrollTop,
    scrollLeft,
    clientHeight,
    clientWidth,
    barStart,
    isInitial,
  } = args;

  const rowTop = index * rowHeight;
  let top = scrollTop;
  if (isInitial) {
    top = rowTop - (clientHeight - rowHeight) / 2; // center on load
  } else if (rowTop < scrollTop) {
    top = rowTop; // above the fold → align to top
  } else if (rowTop + rowHeight > scrollTop + clientHeight) {
    top = rowTop - clientHeight + rowHeight; // below → align to bottom
  }

  let left = scrollLeft;
  if (barStart != null) {
    const viewRight = scrollLeft + clientWidth;
    if (
      barStart < scrollLeft + REVEAL_MARGIN_PX ||
      barStart > viewRight - REVEAL_MARGIN_PX
    ) {
      left = Math.max(0, barStart - clientWidth * REVEAL_LEFT_FRACTION);
    }
  }

  return { top: Math.max(0, top), left };
}
