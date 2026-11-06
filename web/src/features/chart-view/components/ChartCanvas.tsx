import React, { useMemo } from "react";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { usePreparedWidgetChart } from "@/src/features/widgets/components/usePreparedWidgetChart";
import { VisualizationFrame } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { isChartDataEmpty } from "@/src/features/widgets/chart-library/isChartDataEmpty";
import type {
  DataPoint,
  ChartProps,
} from "@/src/features/widgets/chart-library/chart-props";
import { getWidgetMissingBucketValue } from "@/src/features/widgets/utils";

import { type AggregationFn } from "../types";
import { isTimeSeriesChartType } from "../vocab";

const RANKED_ROW_LIMIT = 20;

/**
 * Builds the `chart-library` `ChartConfig` (series labels + the `metric` key the
 * bar/pie primitives colour through `--color-metric`) from the rendered series.
 */
function buildChartConfig(data: DataPoint[], metricLabel: string) {
  const config: NonNullable<ChartProps["config"]> = {};
  // Per-series labels first, so a breakdown value that is literally "metric"
  // (e.g. an observation/model named "metric") keeps its own label.
  for (const point of data) {
    if (point.dimension && config[point.dimension] === undefined) {
      config[point.dimension] = {
        label: point.dimension,
        theme: { light: "hsl(var(--chart-1))", dark: "hsl(var(--chart-1))" },
      };
    }
  }
  // Reserved key the bar/pie primitives colour through `--color-metric`; only
  // add it if no real series already claimed the "metric" key above.
  if (config.metric === undefined)
    config.metric = {
      label: metricLabel,
      theme: { light: "hsl(var(--chart-1))", dark: "hsl(var(--chart-1))" },
    };
  return config;
}

/**
 * View-only chart renderer: takes already-aggregated `DataPoint[]` (from the
 * server query, or the mock aggregator in Storybook) plus the resolved metric
 * label/unit and the handful of config fields that affect rendering, and
 * hands them to the shared `chart-library`. Memoized so a parent re-render or
 * an unrelated config change doesn't re-render the chart.
 *
 * Shared between the observations chart view (`EventsChartView`) and the
 * scores chart view (`@/src/features/scores-chart-view`) — the two configs
 * pick metrics/dimensions from entirely different vocabularies, but once a
 * metric is resolved to a label/unit, the actual rendering is identical.
 * Deliberately takes primitives instead of a `ChartViewConfig`/
 * `ScoreChartViewConfig`, so this component has no dependency on either.
 */
export const ChartCanvas = React.memo(function ChartCanvas({
  data,
  chartType,
  breakdown,
  aggregation,
  metricLabel,
  metricUnit,
  emptyMessage,
}: {
  data: DataPoint[];
  chartType: DashboardWidgetChartType;
  /** The config's breakdown dimension key; only ever compared to `"none"`. */
  breakdown: string;
  aggregation: AggregationFn;
  metricLabel: string;
  metricUnit?: string;
  emptyMessage: string;
}) {
  const chartConfig = useMemo(
    () => buildChartConfig(data, metricLabel),
    [data, metricLabel],
  );

  // Match dashboard widgets: only additive metrics fill missing buckets with zero.
  const prepared = usePreparedWidgetChart({
    chartType,
    data,
    active: !isChartDataEmpty(data),
    rowLimit: RANKED_ROW_LIMIT,
    unit: metricUnit,
    config: chartConfig,
    legendPosition:
      isTimeSeriesChartType(chartType) && breakdown !== "none"
        ? ("below" as const)
        : ("none" as const),
    missingValue: getWidgetMissingBucketValue(aggregation),
  });
  const { confirmation } = prepared;

  if (confirmation) return <VisualizationFrame content={confirmation} />;

  if (isChartDataEmpty(data)) {
    return (
      <VisualizationFrame content={{ type: "empty", message: emptyMessage }} />
    );
  }

  const { visualization } = prepared;
  if (visualization.type === "table" && !visualization.rows.length) {
    return (
      <VisualizationFrame
        content={{
          type: "error",
          message: "Unable to process data for pivot table",
        }}
      />
    );
  }
  if (visualization.type === "histogram" && !visualization.data.length) {
    return <VisualizationFrame content={{ type: "empty" }} />;
  }
  return <VisualizationFrame {...prepared} content={prepared.visualization} />;
});
