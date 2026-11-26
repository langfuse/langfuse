/**
 * Greedy interval packing for the compact timeline.
 *
 * Rows are bands of nesting depth. Within a depth, spans that do not overlap
 * share a lane (touching endpoints share; a zero-duration span occupies its
 * instant). Deeper bands start under every lane of the depth above, so a child
 * sits beneath its parent and a sequential session collapses to one trace row
 * plus the deepest observation stack.
 */

import { spanOffsetsOf, type LayoutNode } from "./layout";

export type CompactLaneRow = {
  depth: number;
  node: LayoutNode;
};

export type CompactPacking = {
  /** Lane for each input row, same order. */
  lanes: number[];
  laneCount: number;
};

type LaneState = {
  /** Exclusive end for a span, or the instant for a point. */
  end: number;
  point: boolean;
};

function isPoint(startMs: number, endMs: number): boolean {
  return endMs <= startMs;
}

function canPlace(lane: LaneState, startMs: number, endMs: number): boolean {
  const point = isPoint(startMs, endMs);
  if (lane.point && point) return lane.end !== startMs;
  if (lane.point) return startMs > lane.end;
  return startMs >= lane.end;
}

function occupied(startMs: number, endMs: number): LaneState {
  if (isPoint(startMs, endMs)) return { end: startMs, point: true };
  return { end: endMs, point: false };
}

export function packCompactLanes(
  rows: readonly CompactLaneRow[],
  originMs: number,
): CompactPacking {
  if (rows.length === 0) return { lanes: [], laneCount: 0 };

  let maxDepth = 0;
  const placed = rows.map((row, index) => {
    if (row.depth > maxDepth) maxDepth = row.depth;
    const offsets = spanOffsetsOf(row.node, originMs);
    return {
      index,
      depth: row.depth,
      startMs: offsets.startMs,
      endMs: Math.max(offsets.endMs, offsets.startMs),
    };
  });

  const lanes = new Array<number>(rows.length);
  const laneCounts: number[] = [];

  for (let depth = 0; depth <= maxDepth; depth++) {
    const atDepth = placed
      .filter((row) => row.depth === depth)
      .sort(
        (a, b) =>
          a.startMs - b.startMs || a.endMs - b.endMs || a.index - b.index,
      );
    const states: LaneState[] = [];
    for (const row of atDepth) {
      let lane = states.findIndex((state) =>
        canPlace(state, row.startMs, row.endMs),
      );
      if (lane < 0) {
        lane = states.length;
        states.push(occupied(row.startMs, row.endMs));
      } else {
        states[lane] = occupied(row.startMs, row.endMs);
      }
      lanes[row.index] = lane;
    }
    laneCounts.push(states.length);
  }

  const offset: number[] = [];
  let acc = 0;
  for (const count of laneCounts) {
    offset.push(acc);
    acc += count;
  }

  for (const row of placed) {
    lanes[row.index] = offset[row.depth]! + lanes[row.index]!;
  }

  return { lanes, laneCount: acc };
}
