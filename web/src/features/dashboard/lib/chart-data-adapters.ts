/**
 * Adapters that transform data prepared for tremor-v4-chart to the recharts chart library data format.
 * This can be removed once we have converted all data API calls to the DataPoint format that recharts expects.
 */
import type { DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import type { TimeSeriesChartDataPoint } from "@/src/features/dashboard/components/hooks";
import type { ChartBin } from "@/src/features/scores/types";
/** Histogram bin shape: binLabel plus numeric fields (e.g. count). Compatible with createHistogramData return type. */
type HistogramBinLike = { binLabel: string; [key: string]: string | number };

/**
 * Converts legacy time series data (ts + values per point) to widget Chart
 * DataPoint[]. One row per (timestamp, label). The timestamp is passed through
 * as a raw ISO string — all date/time *formatting* is decided later by the
 * `prepareTimeAxis` preparer, so every chart formats time identically. (LFE-10549)
 *
 * A value-less entry stays `null` (a gap, never a fabricated 0), and a bucket
 * with no values at all emits a dimension-less marker so the time axis keeps
 * the bucket. (LFE-10694)
 */
export function timeSeriesToDataPoints(
  data: TimeSeriesChartDataPoint[],
): DataPoint[] {
  const result: DataPoint[] = [];
  for (const point of data) {
    const timeDimension = new Date(point.ts).toISOString();
    if (point.values.length === 0) {
      result.push({
        time_dimension: timeDimension,
        dimension: undefined,
        metric: null,
      });
      continue;
    }
    for (const v of point.values) {
      result.push({
        time_dimension: timeDimension,
        dimension: v.label,
        metric: v.value ?? null,
      });
    }
  }
  return result;
}

/**
 * Converts bar list items (name, value) to widget Chart DataPoint[].
 */
export function barListToDataPoints(
  items: {
    name: string;
    value: number;
  }[],
): DataPoint[] {
  return items.map(({ name, value }) => ({
    dimension: name,
    metric: value,
    time_dimension: undefined,
  }));
}

/**
 * Converts score histogram chartData (binLabel + numeric fields, e.g. from createHistogramData) to DataPoint[].
 * One row per bin: dimension = binLabel, metric = sum of values for chartLabels (or single count).
 */
export function scoreHistogramToDataPoints(
  chartData: HistogramBinLike[],
  chartLabels: string[],
): DataPoint[] {
  return chartData.map((bin) => {
    const metric = chartLabels.length
      ? chartLabels.reduce(
          (sum, label) =>
            sum + (Number((bin as Record<string, number>)[label]) || 0),
          0,
        )
      : 0;
    return {
      dimension: bin.binLabel,
      metric,
      time_dimension: undefined,
    };
  });
}

/**
 * Converts categorical score chartData (ChartBin[] with binLabel and category keys) to DataPoint[].
 * One row per bin: dimension = binLabel, metric = sum of all category values for that bin.
 * (Widget VerticalBarChart shows one bar per row; for stacked view we'd need chart-library extension.)
 */
export function scoreChartDataToDataPoints(
  chartData: ChartBin[],
  chartLabels: string[],
): DataPoint[] {
  return chartData.map((bin) => {
    const metric = chartLabels.reduce(
      (sum, label) => sum + ((bin as Record<string, number>)[label] ?? 0),
      0,
    );
    return {
      dimension: bin.binLabel,
      metric,
      time_dimension: undefined,
    };
  });
}

const compareViewMetricUnits = {
  cost: "USD",
  latency: "millisecond",
} as const;

export function getCompareViewChartUnit(metricKey: string): string | undefined {
  return compareViewMetricUnits[
    metricKey as keyof typeof compareViewMetricUnits
  ];
}

const normalizeCompareViewMetric = (metricKey: string, metric: number) =>
  // TODO: remove when revamping the datasets api for it to directly return ms.
  metricKey === "latency" ? metric * 1000 : metric;

/**
 * Converts dataset run compare-view chartData (ChartBin[] from CompareViewAdapter) to DataPoint[].
 * - Single series: one row per run as a time-series point.
 * - Multi series: one row per (run, category) as a bar time-series point.
 */
export function compareViewChartDataToDataPoints(
  chartData: ChartBin[],
  chartLabels: string[],
  metricKey: string,
): DataPoint[] {
  if (chartLabels.length === 0) return [];
  if (chartLabels.length === 1) {
    const label = chartLabels[0]!;
    return chartData.map((bin) => ({
      time_dimension: bin.binLabel,
      dimension: label,
      metric: normalizeCompareViewMetric(
        metricKey,
        (bin as Record<string, number>)[label] ?? 0,
      ),
    }));
  }
  return chartData.flatMap((bin) =>
    chartLabels.map((label) => ({
      time_dimension: bin.binLabel,
      dimension: label,
      metric: normalizeCompareViewMetric(
        metricKey,
        (bin as Record<string, number>)[label] ?? 0,
      ),
    })),
  );
}
