import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { getDimensionSummaries } from "@/src/features/widgets/chart-library/utils";

/**
 * Hard ceiling on how many series a multi-series time chart draws. High-
 * cardinality breakdowns (group-by id / name / user) routinely produce
 * hundreds of series; drawing them all is both unreadable (a legend/tooltip of
 * hundreds of one-off entries) and pathologically slow — recharts re-resolves
 * per-graphical-item state on every hover, so cost grows ~quadratically with
 * series count and a few hundred series make hovering janky. Bounding the drawn
 * set keeps every chart fast and legible regardless of the data thrown at it.
 * (LFE-10549)
 */
export const DEFAULT_MAX_RENDERED_SERIES = 25;

export type PreparedSeries = {
  /**
   * The series to draw, highest-magnitude first when the data overflowed the
   * cap (so the biggest contributors win the cap and the stable palette slots).
   * Returned in the caller's original order when nothing was dropped, so normal
   * charts keep their existing color assignment.
   */
  visible: string[];
  /** Distinct series present in the data. */
  total: number;
  /** Series not drawn (`total - visible.length`); `0` when nothing was capped. */
  hidden: number;
};

/**
 * Preparer (data -> visualiser seam): decides WHICH series a chart draws when
 * the breakdown is too wide to show them all. Ranks series by additive
 * magnitude (sum of finite metric values; this also tracks "most prominent" for
 * non-additive metrics well enough to pick the headline series) and keeps the
 * top `maxSeries`. Series with no finite value rank last. Ties break by name so
 * the selection is deterministic across reloads.
 *
 * Pure and side-effect free: presentation components consume the result, they
 * don't re-decide it. See ARCHITECTURE.md.
 */
export function prepareVisibleSeries(
  data: DataPoint[],
  dimensions: string[],
  maxSeries: number = DEFAULT_MAX_RENDERED_SERIES,
): PreparedSeries {
  const total = dimensions.length;
  if (total <= maxSeries) {
    return { visible: dimensions, total, hidden: 0 };
  }

  const summaries = getDimensionSummaries(data);
  const magnitude = (dimension: string): number =>
    summaries.get(dimension) ?? -Infinity;

  const ranked = [...dimensions].sort((a, b) => {
    const diff = magnitude(b) - magnitude(a);
    if (diff !== 0 && !Number.isNaN(diff)) return diff;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const visible = ranked.slice(0, maxSeries);
  return { visible, total, hidden: total - visible.length };
}
