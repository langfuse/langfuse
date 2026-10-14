import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

/**
 * How far an aggregate may exceed the components it sums before the difference
 * is treated as real rather than as floating-point drift. Relative to the
 * aggregate, and six orders of magnitude above the error of summing a handful
 * of doubles — so a cost that is genuinely unattributed is never mistaken for
 * noise, and noise is never drawn as a segment.
 */
const ATTRIBUTION_TOLERANCE = 1e-9;

/**
 * Preparer (data -> visualiser seam): reduces a breakdown's own aggregate to the
 * part of itself that its components do not already account for.
 *
 * Some breakdowns carry their own total: the `costType` and `usageType`
 * dimensions expand the keys of `cost_details` / `usage_details`, and those maps
 * hold a `"total"` beside the components it sums. A chart that renders the
 * breakdown as one whole — a stacked bar, whose height is the sum of its
 * segments; a pie, whose circle is — then draws the same money twice, so the bar
 * reaches double the real cost and every pie slice reads half its true share. A
 * chart that draws each member on its own (a line, an area, one bar per
 * category) has no such problem and must keep the aggregate, which is why this
 * is applied per chart type rather than to the data for every chart.
 *
 * `aggregateValue` names the member to reduce and comes from the dimension's
 * declaration (`getDimensionAggregateValue`), never from matching the string
 * `"total"` — a user breakdown with a category genuinely named "total" is not an
 * aggregate and keeps every one of its members untouched.
 *
 * Subtracting rather than dropping is what keeps the whole honest, because the
 * aggregate is a sum over the bucket and not every row beneath it has
 * components: a cost provided at ingestion is stored as `{ total: n }` with no
 * per-key breakdown, and sits in the same bucket as model-priced costs that do
 * have one. Dropping the aggregate outright would erase that cost from the
 * chart. So per bucket:
 *
 * - no components at all — a bucket, or a whole pie, of nothing but totals —
 *   keeps its aggregate whole;
 * - components that account for all of it lose it, which is the ordinary case
 *   and the one the double-counting bug lives in;
 * - components that account for part of it leave the remainder standing, so the
 *   stack still reaches the bucket's real total. That remainder keeps the
 *   aggregate's own name because it is what the data calls it: cost recorded
 *   only as a total, with no type of its own.
 *
 * Pure and side-effect free; returns the input array itself when nothing is
 * reduced, so a memoized consumer does not re-render. See ARCHITECTURE.md.
 */
export function prepareBreakdownSegments(
  data: DataPoint[],
  aggregateValue: string | undefined,
): DataPoint[] {
  if (aggregateValue === undefined) return data;

  // Bucket -> the value its components account for. A bucket is absent from the
  // map when it has no component carrying a value, which is what distinguishes
  // "nothing to subtract" from "subtract zero".
  const attributed = new Map<string | undefined, number>();
  let hasAggregate = false;

  for (const point of data) {
    if (point.dimension === aggregateValue) {
      hasAggregate = true;
      continue;
    }
    // A point with no dimension is a bucket marker, not a component: it keeps an
    // empty bucket on the time axis without contributing to the stack.
    if (!point.dimension) continue;
    if (typeof point.metric !== "number" || !Number.isFinite(point.metric)) {
      continue;
    }
    attributed.set(
      point.time_dimension,
      (attributed.get(point.time_dimension) ?? 0) + point.metric,
    );
  }

  if (!hasAggregate || attributed.size === 0) return data;

  let reduced = false;
  const segments: DataPoint[] = [];

  for (const point of data) {
    if (
      point.dimension !== aggregateValue ||
      typeof point.metric !== "number" ||
      !Number.isFinite(point.metric)
    ) {
      segments.push(point);
      continue;
    }

    const accountedFor = attributed.get(point.time_dimension);
    if (accountedFor === undefined) {
      segments.push(point);
      continue;
    }

    const remainder = point.metric - accountedFor;
    if (remainder <= Math.abs(point.metric) * ATTRIBUTION_TOLERANCE) {
      reduced = true;
      continue;
    }

    segments.push({ ...point, metric: remainder });
    reduced = true;
  }

  return reduced ? segments : data;
}
