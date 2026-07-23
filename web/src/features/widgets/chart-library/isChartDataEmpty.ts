import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

/**
 * Preparer (data -> visualiser seam): decides whether a chart has nothing
 * honest to draw, so the dispatcher can fail into a "No data" state instead of
 * a blank canvas (manifesto principle 8).
 *
 * Mirrors the legacy `isEmptyTimeSeries` detector
 * (`dashboard/components/hooks.ts`): a metric of `null` (no honest value
 * measured — see {@link DataPoint}) or a real `0` both count as "nothing to
 * show", because the upstream query densifies an empty time range into
 * zero/null-filled bucket rows rather than an empty array. A histogram-shaped
 * metric (`number[][]`, see {@link DataPoint}) is empty when there are no bins
 * or every bin is itself an empty array.
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
  return metric === 0;
}
