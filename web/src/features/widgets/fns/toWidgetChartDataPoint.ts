import { type DataPoint } from "../chart-library/chart-props";
import { formatMetricName, getWidgetMissingBucketValue } from "../utils";

export function toWidgetChartDataPoint({
  metricValue,
  metricField,
  aggregation,
  dimensionValue,
  timeDimension,
  isTimeSeries,
  dimensionLabelMap,
  normalizeHistogram,
}: {
  metricValue: unknown;
  metricField: string;
  aggregation: string;
  dimensionValue: unknown;
  timeDimension: string | undefined;
  isTimeSeries: boolean;
  dimensionLabelMap: ReadonlyMap<string, string> | undefined;
  normalizeHistogram: boolean;
}): DataPoint {
  // Gap-filled buckets must retain their axis position without inventing a
  // series. A real dimension-less average of zero is not filler. (LFE-10694)
  const isFillerMetricValue =
    metricValue == null ||
    (getWidgetMissingBucketValue(aggregation) === "zero" &&
      Number(metricValue) === 0);
  if (
    isTimeSeries &&
    (dimensionValue === null || dimensionValue === "") &&
    isFillerMetricValue
  ) {
    return {
      time_dimension: timeDimension,
      dimension: undefined,
      metric: null,
    };
  }

  return {
    time_dimension: timeDimension,
    dimension: (() => {
      if (dimensionValue === undefined) return formatMetricName(metricField);
      if (dimensionValue === null || dimensionValue === "") return "n/a";
      if (typeof dimensionValue === "string")
        return dimensionLabelMap?.get(dimensionValue) ?? dimensionValue;
      if (Array.isArray(dimensionValue)) return dimensionValue.join(", ");
      return String(dimensionValue);
    })(),
    metric: (() => {
      if (Array.isArray(metricValue)) {
        if (!normalizeHistogram) return metricValue;
        return metricValue.map((bin: unknown) =>
          Array.isArray(bin) ? bin.map(Number) : [],
        );
      }
      if (isTimeSeries && metricValue == null) return null;
      return Number(metricValue || 0);
    })(),
  };
}
