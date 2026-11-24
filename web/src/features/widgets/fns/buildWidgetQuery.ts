import { type z } from "zod";
import {
  type DashboardWidgetChartType,
  type FilterState,
  type OrderByState,
} from "@langfuse/shared";
import {
  buildWidgetOrderBy,
  isV2BreakdownChart,
  toQueryChartConfig,
  type metricAggregations,
  type QueryType,
  type views,
  type ViewVersion,
} from "@langfuse/shared/query";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";

/** The parts of a dashboard widget definition its query depends on. */
type WidgetQueryDefinition = {
  view: z.infer<typeof views>;
  chartType: DashboardWidgetChartType;
  chartConfig: { type: string; bins?: number; row_limit?: number };
  metrics: { measure: string; agg: string }[];
  dimensions: { field: string }[];
};

/**
 * The query a dashboard widget runs over a time range: breakdowns on v2 get
 * their top 100 rows by the first metric, and pivot tables the given sort.
 * Rendering-only chart settings (defaultSort, show_value_labels) stay out.
 */
export function buildWidgetQuery(params: {
  widget: WidgetQueryDefinition;
  filters: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  sortState: OrderByState | null;
  version: ViewVersion;
}): QueryType {
  const { widget } = params;
  const isTimeSeries = isTimeSeriesChart(widget.chartType);
  const chartType = widget.chartConfig.type;
  const needsTopN = isV2BreakdownChart({
    version: params.version,
    hasDimension: widget.dimensions.length > 0,
    isTimeSeries,
    chartType,
  });
  const firstMetric = widget.metrics[0];

  return {
    view: widget.view,
    dimensions: widget.dimensions,
    metrics: widget.metrics.map((metric) => ({
      measure: metric.measure,
      aggregation: metric.agg as z.infer<typeof metricAggregations>,
    })),
    filters: params.filters,
    timeDimension: isTimeSeries ? { granularity: "auto" as const } : null,
    fromTimestamp: params.fromTimestamp.toISOString(),
    toTimestamp: params.toTimestamp.toISOString(),
    orderBy: buildWidgetOrderBy({
      chartType,
      sortState: params.sortState,
      needsTopN,
      firstMetric: firstMetric
        ? { aggregation: firstMetric.agg, measure: firstMetric.measure }
        : undefined,
    }),
    chartConfig: toQueryChartConfig(widget.chartConfig, {
      defaultRowLimit: needsTopN ? 100 : undefined,
    }),
  };
}
