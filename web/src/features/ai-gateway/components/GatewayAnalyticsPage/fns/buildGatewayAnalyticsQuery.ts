import type { FilterCondition } from "@langfuse/shared";
import {
  buildWidgetOrderBy,
  isV2BreakdownChart,
  toQueryChartConfig,
  type QueryType,
} from "@langfuse/shared/query";
import { isTimeSeriesChart } from "@/src/features/widgets";
import type { GatewayAnalyticsWidget } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";

/**
 * The ingestion project can also receive SDK traffic; only observations
 * stamped with a gateway key at ingestion count as gateway usage.
 */
const GATEWAY_TRAFFIC_FILTER: FilterCondition = {
  column: "aiGatewayKeyId",
  operator: "is not null",
  value: "",
  type: "null",
};

/** Top-N cap for breakdowns that do not set their own row limit. */
const DEFAULT_BREAKDOWN_ROW_LIMIT = 100;

export function buildGatewayAnalyticsQuery(
  widget: GatewayAnalyticsWidget,
  timeRange: { from: Date; to: Date },
): QueryType {
  const chartType = widget.chartConfig.type;
  const isTimeSeries = isTimeSeriesChart(chartType);
  const needsTopN = isV2BreakdownChart({
    version: "v2",
    hasDimension: widget.dimensions.length > 0,
    isTimeSeries,
    chartType,
  });
  const metrics = widget.metrics.map((metric) => ({
    measure: metric.measure,
    aggregation: metric.agg as QueryType["metrics"][number]["aggregation"],
  }));

  return {
    view: widget.view,
    dimensions: widget.dimensions,
    metrics,
    filters: [GATEWAY_TRAFFIC_FILTER, ...widget.filters],
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
