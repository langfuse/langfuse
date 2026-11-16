import type { FilterState } from "@langfuse/shared";
import {
  buildWidgetOrderBy,
  isV2BreakdownChart,
  toQueryChartConfig,
  type QueryType,
} from "@langfuse/shared/query";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import type { GatewayAnalyticsWidget } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import { GATEWAY_TRAFFIC_FILTER } from "@/src/features/ai-gateway/constants/gatewayTrafficFilter";

/** Top-N cap for breakdowns that do not set their own row limit. */
const DEFAULT_BREAKDOWN_ROW_LIMIT = 100;

export function buildGatewayAnalyticsQuery(
  widget: GatewayAnalyticsWidget,
  timeRange: { from: Date; to: Date },
  filters: FilterState,
): QueryType {
  const chartType = widget.chartType;
  const isTimeSeries = isTimeSeriesChart(chartType);
  const needsTopN = isV2BreakdownChart({
    version: "v2",
    hasDimension: widget.dimensions.length > 0,
    isTimeSeries,
    chartType,
  });
  const metrics = widget.metrics.map((metric) => ({
    measure: metric.measure,
    aggregation: metric.agg,
  }));

  return {
    view: widget.view,
    dimensions: widget.dimensions,
    metrics,
    filters: [GATEWAY_TRAFFIC_FILTER, ...widget.filters, ...filters],
    timeDimension: isTimeSeries ? { granularity: "auto" } : null,
    fromTimestamp: timeRange.from.toISOString(),
    toTimestamp: timeRange.to.toISOString(),
    orderBy: buildWidgetOrderBy({
      chartType,
      sortState: null,
      needsTopN,
      firstMetric: metrics[0],
    }),
    chartConfig: toQueryChartConfig(widget.chartConfig, {
      defaultRowLimit: needsTopN ? DEFAULT_BREAKDOWN_ROW_LIMIT : undefined,
    }),
  };
}
