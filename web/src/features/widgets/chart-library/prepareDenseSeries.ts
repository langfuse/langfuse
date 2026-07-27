import { type MissingBucketValue } from "@/src/features/widgets/chart-library/chart-props";
import { type TimeSeriesGroupedRow } from "@/src/features/widgets/chart-library/utils";

/**
 * Preparer (data -> visualiser seam): makes every (bucket, series) cell
 * explicit so the renderer never guesses what "no data point" means.
 *
 * The upstream query densifies the time axis (every bucket in the queried
 * range arrives as at least one row), but a series only has rows for buckets
 * where it measured something. Left implicit, the missing cells let the chart
 * lie: a smoothed line draws straight across buckets that have no data,
 * fabricating a trend. This pass fills each missing cell with the metric's
 * honest no-data value — a real `0` for additive metrics, `null` (a visible
 * gap) for non-additive ones. Real `0`s and `null`s in the data pass through
 * untouched; buckets are never invented, only completed. (LFE-10694,
 * manifesto V2: missing is a gap, not a zero.)
 *
 * Pure and side-effect free: presentation components consume the result, they
 * don't re-decide it. See ARCHITECTURE.md.
 */
export function prepareDenseSeries(
  rows: TimeSeriesGroupedRow[],
  dimensions: string[],
  missingValue: MissingBucketValue,
): TimeSeriesGroupedRow[] {
  const fill = missingValue === "zero" ? 0 : null;
  return rows.map((row) => {
    const filled: TimeSeriesGroupedRow = { ...row };
    for (const dimension of dimensions) {
      if (!(dimension in filled)) {
        filled[dimension] = fill;
      }
    }
    return filled;
  });
}

/**
 * Preparer: finds each series' isolated points — real values with no drawable
 * neighbor on either side. With gaps rendered honestly (no `connectNulls`),
 * such a point spans no line segment, so without a marker it would be
 * invisible, silently dropping real data (V8). The visualiser draws a dot for
 * exactly these points.
 *
 * @returns per-dimension sets of isolated row indices; dimensions without any
 *   isolated point are absent, so the common dense case costs the renderer
 *   nothing.
 */
export function prepareIsolatedPoints(
  rows: TimeSeriesGroupedRow[],
  dimensions: string[],
): Map<string, Set<number>> {
  const isolated = new Map<string, Set<number>>();
  for (const dimension of dimensions) {
    const drawable = (row: TimeSeriesGroupedRow | undefined): boolean =>
      typeof row?.[dimension] === "number" &&
      Number.isFinite(row[dimension] as number);
    for (let index = 0; index < rows.length; index++) {
      if (
        drawable(rows[index]) &&
        !drawable(rows[index - 1]) &&
        !drawable(rows[index + 1])
      ) {
        let set = isolated.get(dimension);
        if (!set) {
          set = new Set();
          isolated.set(dimension, set);
        }
        set.add(index);
      }
    }
  }
  return isolated;
}
