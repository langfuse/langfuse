/**
 * Compact timeline rows: one lane per nesting depth.
 *
 * Every visible span at the same depth shares that lane, including spans that
 * overlap in time. Those draw on top of each other. Deeper lanes sit under
 * shallower ones, so a sequential session is one trace row plus the deepest
 * observation stack.
 */

export type CompactLaneRow = {
  depth: number;
};

export type CompactPacking = {
  /** Lane for each input row, same order. */
  lanes: number[];
  laneCount: number;
};

export function packCompactLanes(
  rows: readonly CompactLaneRow[],
): CompactPacking {
  if (rows.length === 0) return { lanes: [], laneCount: 0 };

  let laneCount = 0;
  const lanes = rows.map((row) => {
    const lane = Math.max(row.depth, 0);
    if (lane + 1 > laneCount) laneCount = lane + 1;
    return lane;
  });

  return { lanes, laneCount };
}
