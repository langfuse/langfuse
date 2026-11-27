import type { LayoutNode, PackedPacking } from "../types";

/**
 * One row per observation type, in the order the types first appear in the
 * tree. `nesting` says how many ancestors of its own type each span has, since
 * those sit on the same row and the span is drawn inside them.
 */
export function packLanes(
  rows: readonly { node: LayoutNode; depth: number }[],
): PackedPacking {
  const laneOf = new Map<string, number>();
  /** Open ancestors of the row being placed, and how many there are per type. */
  const ancestors: { depth: number; type: string }[] = [];
  const open = new Map<string, number>();
  const lanes: number[] = [];
  const nesting: number[] = [];

  for (const row of rows) {
    const type = row.node.type ?? "SPAN";
    while ((ancestors.at(-1)?.depth ?? -1) >= row.depth) {
      const closed = ancestors.pop();
      if (closed) open.set(closed.type, (open.get(closed.type) ?? 1) - 1);
    }
    const level = open.get(type) ?? 0;
    ancestors.push({ depth: row.depth, type });
    open.set(type, level + 1);

    if (!laneOf.has(type)) laneOf.set(type, laneOf.size);
    lanes.push(laneOf.get(type) ?? 0);
    nesting.push(level);
  }

  return { lanes, laneCount: laneOf.size, types: [...laneOf.keys()], nesting };
}
