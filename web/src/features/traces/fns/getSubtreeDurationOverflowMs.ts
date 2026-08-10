import { formatIntervalSeconds } from "@/src/utils/dates";

/**
 * Decides whether a node's subtree wall-clock duration should be shown as a
 * distinct badge alongside its own-span duration (LFE-10475), and returns that
 * duration (ms) when it should.
 *
 * Async children can outlive their parent span, so a parent's own
 * (endTime − startTime) can understate the real elapsed time of its subtree.
 * The subtree always contains the own span, so it can only be ≥ own. We surface
 * the badge on any difference that is visible at the rendered precision — i.e.
 * when the subtree would display a different value than the own span. This shows
 * every difference the user can actually see (down to the formatter's 0.01s
 * resolution) while never rendering two identical-looking numbers. Users who
 * don't want durations at all can hide them via the "show duration" toggle.
 *
 * A missing own-span duration is treated as 0 so that nodes without a recorded
 * end still surface a meaningful subtree duration.
 *
 * @param ownDurationMs - the node's own span duration (endTime − startTime), ms
 * @param subtreeWallClockDurationMs - max(end) − min(start) across the subtree, ms
 */
export function getSubtreeDurationOverflowMs(
  ownDurationMs: number | undefined | null,
  subtreeWallClockDurationMs: number | undefined | null,
): number | null {
  if (subtreeWallClockDurationMs == null) return null;
  const own = ownDurationMs ?? 0;
  if (subtreeWallClockDurationMs <= own) return null;
  if (
    formatIntervalSeconds(subtreeWallClockDurationMs / 1000) ===
    formatIntervalSeconds(own / 1000)
  )
    return null;
  return subtreeWallClockDurationMs;
}
