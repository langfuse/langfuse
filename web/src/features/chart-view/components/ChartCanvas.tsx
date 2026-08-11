import React, { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { getWidgetMissingBucketValue } from "@/src/features/widgets/utils";
import { type ChartConfig } from "@/src/components/ui/chart";
import { type ChartViewConfig } from "../types";
import { getMetric, isTimeSeriesChartType } from "../vocab";

const RANKED_ROW_LIMIT = 20;

/**
 * Builds the `chart-library` `ChartConfig` (series labels + the `metric` key the
 * bar/pie primitives colour through `--color-metric`) from the rendered series.
 */
function buildChartConfig(data: DataPoint[], metricLabel: string): ChartConfig {
  const config: ChartConfig = {};
  // Per-series labels first, so a breakdown value that is literally "metric"
  // (e.g. an observation/model named "metric") keeps its own label.
  for (const point of data) {
    if (point.dimension && config[point.dimension] === undefined) {
      config[point.dimension] = { label: point.dimension };
    }
  }
  // Reserved key the bar/pie primitives colour through `--color-metric`; only
  // add it if no real series already claimed the "metric" key above.
  if (config.metric === undefined) config.metric = { label: metricLabel };
  return config;
}

/**
 * View-only chart renderer: takes already-aggregated `DataPoint[]` (from the
 * server query, or the mock aggregator in Storybook) plus the config, and hands
 * them to the shared `chart-library`. Memoized so a parent re-render or an
 * unrelated config change doesn't re-render the chart.
 */
export const ChartCanvas = React.memo(function ChartCanvas({
  data,
  config,
  emptyMessage = "No events match the current filters.",
}: {
  data: DataPoint[];
  config: ChartViewConfig;
  emptyMessage?: string;
}) {
  const metric = getMetric(config.metric);
  const chartConfig = useMemo(
    () => buildChartConfig(data, metric.label),
    [data, metric.label],
  );

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <BarChart3 className="h-10 w-10 opacity-40" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  // Show the series legend only for a multi-series time chart. The shared
  // chart-library renders the legend below the plot now (LFE-10576), so "below"
  // is the value that used to be "above" here.
  const isTimeSeries = isTimeSeriesChartType(config.chartType);
  const legendPosition =
    isTimeSeries && config.breakdown !== "none" ? "below" : "none";

  return (
    <Chart
      chartType={config.chartType}
      data={data}
      rowLimit={RANKED_ROW_LIMIT}
      chartConfig={{ type: config.chartType, unit: metric.unit }}
      config={chartConfig}
      legendPosition={legendPosition}
      // Match dashboard widgets: additive metrics (count/sum) fill an empty
      // bucket with a 0 (continuous line), non-additive ones leave a gap — so a
      // chart renders the same here as once saved to a dashboard.
      missingValue={getWidgetMissingBucketValue(config.aggregation)}
    />
  );
});
