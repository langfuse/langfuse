import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import { getWidgetMissingBucketValue } from "@/src/features/widgets/utils";
import { type MultiQuerySeries, type MultiQueryValue } from "./multiQueryModel";

export function prepareMultiQueryTimeSeriesData(
  series: MultiQuerySeries[],
  values: MultiQueryValue[],
  bucketTimes: readonly string[],
): Pick<ChartProps, "data" | "missingValue"> {
  const ids = new Set(series.map((item) => item.id));
  const rows = values.filter((row) => ids.has(row.seriesId));
  const data: ChartProps["data"] = rows.map((row) => ({
    dimension: row.seriesId,
    time_dimension: row.time ?? undefined,
    metric: row.value,
  }));
  const presentTimes = new Set(rows.map((row) => row.time));
  for (const time of bucketTimes)
    if (!presentTimes.has(time))
      data.push({ dimension: undefined, time_dimension: time, metric: null });
  data.sort((a, b) =>
    (a.time_dimension ?? "").localeCompare(b.time_dimension ?? ""),
  );
  return {
    data,
    missingValue: Object.fromEntries(
      series.map((item) => [
        item.id,
        getWidgetMissingBucketValue(item.aggregation),
      ]),
    ),
  };
}
