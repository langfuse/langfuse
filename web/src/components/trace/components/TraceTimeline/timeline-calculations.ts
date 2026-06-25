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
