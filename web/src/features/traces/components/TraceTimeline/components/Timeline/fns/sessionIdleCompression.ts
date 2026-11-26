/**
 * Collapses idle time between session traces on the timeline axis.
 *
 * The threshold and the label words come from the session sidebar
 * (`IDLE_GAP_THRESHOLD_SECONDS`, `formatIdleGap`). Each collapsed gap keeps a
 * fixed pixel band; zoom and pan stay in that compressed space, and
 * `toRealMs` puts tick labels back on the real clock.
 */

import { IDLE_GAP_THRESHOLD_SECONDS } from "@/src/features/sessions/sessionIdleGap";
import type { LayoutNode, TimeCompression } from "../types";
import { compressionFromCollapsedGaps } from "./compressionFromCollapsedGaps";
import { spanOffsetsOf } from "./spanOffsetsOf";

/** Width of one collapsed idle band. The label sits in the axis, not the band. */
const SESSION_IDLE_BAND_PX = 36;

type TraceRow = {
  depth: number;
  node: LayoutNode;
};

function sessionIdleGaps(
  rows: readonly TraceRow[],
  originMs: number,
): Array<{ start: number; end: number }> {
  const intervals: Array<[number, number]> = [];
  for (const row of rows) {
    if (row.depth !== 0) continue;
    const offsets = spanOffsetsOf(row.node, originMs);
    const start = offsets.startMs;
    intervals.push([start, Math.max(offsets.endMs, start)]);
  }
  intervals.sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) {
      last[1] = Math.max(last[1], interval[1]);
    } else {
      merged.push([interval[0], interval[1]]);
    }
  }

  const thresholdMs = IDLE_GAP_THRESHOLD_SECONDS * 1000;
  const gaps: Array<{ start: number; end: number }> = [];
  for (let index = 1; index < merged.length; index++) {
    const start = merged[index - 1]![1];
    const end = merged[index]![0];
    if (end - start >= thresholdMs) gaps.push({ start, end });
  }
  return gaps;
}

export function sessionIdleCompression(options: {
  rows: readonly TraceRow[];
  originMs: number;
  durationMs: number;
  physicalWidth: number;
}): TimeCompression | null {
  const gaps = sessionIdleGaps(options.rows, options.originMs);
  if (gaps.length === 0) return null;
  return compressionFromCollapsedGaps({
    durationMs: options.durationMs,
    physicalWidth: options.physicalWidth,
    gaps,
    collapsedGapPx: SESSION_IDLE_BAND_PX,
  });
}
