import { type ComponentProps } from "react";
import { type WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import {
  getWidgetRowLimit,
  toWidgetChartDataPoints,
  toWidgetRenderChartConfig,
} from "@/src/features/widgets/fns/widgetChartProps";
import {
  getWidgetMetricPresentation,
  getWidgetMissingBucketValue,
  sanitizePivotTableDefaultSort,
} from "@/src/features/widgets/utils";
import { type WidgetPayload } from "../../core/widget-payload";

type ChartCardProps = Extract<
  ComponentProps<typeof WidgetChartCard>,
  { chartType: unknown; data: unknown }
>;

/**
 * Maps a `renderWidget` payload to `WidgetChartCard` props with the same
 * steps a dashboard tile (`DashboardWidget`) uses for its query rows.
 */
export function toChartProps(
  payload: WidgetPayload,
): Omit<ChartCardProps, "title" | "description" | "tabs" | "actions"> {
  const { chartConfig, version } = payload;
  // renderWidget only sends widgets with a metric.
  const metric = payload.metrics[0]!;
  const presentation =
    payload.chartType === "PIVOT_TABLE"
      ? undefined
      : getWidgetMetricPresentation({ metric, view: payload.view, version });

  return {
    config: presentation
      ? { metric: { label: presentation.label } }
      : undefined,
    metricFormatter: presentation?.metricFormatter,
    missingValue: getWidgetMissingBucketValue(metric.agg),
    chartType: payload.chartType,
    data: toWidgetChartDataPoints(payload, payload.rows),
    chartConfig: toWidgetRenderChartConfig(payload, {
      version,
      defaultSort: sanitizePivotTableDefaultSort(
        chartConfig.type === "PIVOT_TABLE"
          ? chartConfig.defaultSort
          : undefined,
        payload,
      ),
    }),
    rowLimit: getWidgetRowLimit(chartConfig),
  };
}
