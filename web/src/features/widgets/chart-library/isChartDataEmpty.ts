import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

/**
 * Preparer (data -> visualiser seam): decides whether a chart has nothing
 * honest to draw, so the dispatcher can fail into a "No data" state instead of
 * a blank canvas (manifesto principle 8).
 *
 * Empty means: no rows at all, or every point's metric is `null` — "measured
 * nothing here" (see {@link DataPoint}'s doc). A histogram-shaped metric
 * (`number[][]`, see {@link DataPoint}) is empty when there are no bins or
 * every bin is itself an empty array.
 *
 * Deliberately NULL-ONLY, unlike the legacy `isEmptyTimeSeries` detector
 * (`dashboard/components/hooks.ts`), which also collapses a real `0` into
 * "empty" by default. A real `0` is an honest, deliberate value here — never
 * coerced from a gap (manifesto V2 / principle 6; `DataPoint.metric`'s doc)
 * — and callers already rely on it rendering: a genuine zero-average score
 * chart (`NumericScoreTimeSeriesChart`, which opts out of the legacy
 * detector's zero-collapsing via `isNullValueAllowed: true`), a monitor
 * alert-preview whose measure is zero across the window (thresholds still
 * need to draw), and any additive count/sum series whose honest value for an
 * empty bucket is a real `0` (`getWidgetMissingBucketValue`). Treating that
 * as "no data" would hide real, correct charts.
 *
 * Pure and side-effect free — see ARCHITECTURE.md.
 */
export function isChartDataEmpty(data: DataPoint[]): boolean {
  return (
    data.length === 0 || data.every((point) => isMetricEmpty(point.metric))
  );
}

function isMetricEmpty(metric: DataPoint["metric"]): boolean {
  if (metric == null) return true;
  if (Array.isArray(metric)) {
    return metric.length === 0 || metric.every((bin) => bin.length === 0);
  }
  return false; // a real number, including 0, is an honest value — never "empty".
}
