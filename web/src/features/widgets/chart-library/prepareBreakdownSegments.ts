import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

/**
 * Preparer (data -> visualiser seam): decides WHICH members of a breakdown a
 * chart may add up.
 *
 * Some breakdowns carry their own total: the `costType` and `usageType`
 * dimensions expand the keys of `cost_details` / `usage_details`, and those
 * maps hold a `"total"` beside the components it sums. A chart that renders the
 * breakdown as one whole — a stacked bar, whose height is the sum of its
 * segments; a pie, whose circle is — then draws the same money twice, so the
 * bar reaches double the real cost and every pie slice reads half its true
 * share. A chart that draws each member on its own (a line, an area, one bar
 * per category) has no such problem and must keep the aggregate, which is why
 * this is applied per chart type rather than to the data for every chart.
 *
 * `aggregateValue` names the member to separate out and comes from the
 * dimension's declaration (`getDimensionAggregateValue`), never from matching
 * the string `"total"` — a user breakdown with a category genuinely named
 * "total" is not an aggregate and keeps every one of its members.
 *
 * The decision is taken per time bucket, and a bucket keeps its aggregate
 * unless it holds a component with a value: dropping the one member a bucket
 * has would erase real cost from the chart rather than correct it. Cost that
 * arrives already totalled (a cost provided at ingestion, with no per-key
 * breakdown) is exactly that case, and it can sit in the same widget as
 * buckets that do have components.
 *
 * Pure and side-effect free; returns the input array itself when nothing is
 * separated out, so a memoized consumer does not re-render. See ARCHITECTURE.md.
 */
export function prepareBreakdownSegments(
  data: DataPoint[],
  aggregateValue: string | undefined,
): DataPoint[] {
  if (aggregateValue === undefined) return data;

  const bucketsWithComponents = new Set<string | undefined>();
  let hasAggregate = false;

  for (const point of data) {
    if (point.dimension === aggregateValue) {
      hasAggregate = true;
      continue;
    }
    // A point with no dimension is a bucket marker, not a component: it keeps
    // an empty bucket on the time axis without contributing to the stack.
    if (!point.dimension) continue;
    if (typeof point.metric === "number" && Number.isFinite(point.metric)) {
      bucketsWithComponents.add(point.time_dimension);
    }
  }

  if (!hasAggregate || bucketsWithComponents.size === 0) return data;

  const segments = data.filter(
    (point) =>
      point.dimension !== aggregateValue ||
      !bucketsWithComponents.has(point.time_dimension),
  );

  return segments.length === data.length ? data : segments;
}
