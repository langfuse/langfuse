import type { LayoutNode, PackedPacking } from "../types";
import { endOf } from "./endOf";
import { startOf } from "./startOf";

/**
 * One row per observation type, in the order the types first appear in the
 * tree. Spans of one type can overlap in time, nested or not, so `overlap`
 * gives each span a level that differs from every span it overlaps.
 */
export function packLanes(
  rows: readonly { node: LayoutNode }[],
): PackedPacking {
  const laneOf = new Map<string, number>();
  const spansByLane: { index: number; start: number; end: number }[][] = [];
  const lanes = rows.map((row, index) => {
    const type = row.node.type ?? "SPAN";
    const lane = laneOf.get(type) ?? laneOf.size;
    laneOf.set(type, lane);
    const start = startOf(row.node);
    const spans = spansByLane[lane] ?? [];
    spansByLane[lane] = spans;
    spans.push({ index, start, end: Math.max(endOf(row.node), start) });
    return lane;
  });

  const overlap = new Array<number>(rows.length).fill(0);
  for (const spans of spansByLane) {
    /** Per level: when the span last placed on it ends. */
    const levelEnds: number[] = [];
    // The sort is stable, so a parent stays ahead of a child starting with it.
    for (const span of spans.toSorted((a, b) => a.start - b.start)) {
      const free = levelEnds.findIndex((end) => end <= span.start);
      const level = free === -1 ? levelEnds.length : free;
      levelEnds[level] = span.end;
      overlap[span.index] = level;
    }
  }

  return { lanes, laneCount: laneOf.size, types: [...laneOf.keys()], overlap };
}
