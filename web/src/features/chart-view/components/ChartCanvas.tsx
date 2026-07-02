import React, { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { type ChartConfig } from "@/src/components/ui/chart";
import { type ChartViewConfig } from "../types";
import { getMetric, isTimeSeriesChartType } from "../vocab";

const RANKED_ROW_LIMIT = 20;

/**
 * Builds the `chart-library` `ChartConfig` (series labels + the `metric` key the
 * bar/pie primitives colour through `--color-metric`) from the rendered series.
 */
function buildChartConfig(data: DataPoint[], metricLabel: string): ChartConfig {
  const config: ChartConfig = { metric: { label: metricLabel } };
  for (const point of data) {
    if (point.dimension && !config[point.dimension]) {
      config[point.dimension] = { label: point.dimension };
    }
  }
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

  const isTimeSeries = isTimeSeriesChartType(config.chartType);
  const legendPosition =
    isTimeSeries && config.breakdown !== "none" ? "above" : "none";

  return (
    <Chart
      chartType={config.chartType}
      data={data}
      rowLimit={RANKED_ROW_LIMIT}
      chartConfig={{ type: config.chartType, unit: metric.unit }}
      config={chartConfig}
      legendPosition={legendPosition}
    />
  );
});
