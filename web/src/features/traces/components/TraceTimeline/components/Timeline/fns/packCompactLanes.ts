import type { CompactLaneRow, CompactPacking } from "../types";

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
