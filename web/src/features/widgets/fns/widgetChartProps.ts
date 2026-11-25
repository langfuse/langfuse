import { type DashboardWidgetChartType } from "@langfuse/shared";
import { getResultUnit, type ViewVersion } from "@langfuse/shared/query";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import { toWidgetChartDataPoint } from "@/src/features/widgets/fns/toWidgetChartDataPoint";

type WidgetMetric = { measure: string; agg: string };

/**
 * A dashboard widget's query rows as chart data points: the first metric by
 * the first dimension. Pivot tables keep every row field; the table reads
 * its columns from the chart config.
 */
export function toWidgetChartDataPoints(
  widget: {
    chartType: DashboardWidgetChartType;
    metrics: WidgetMetric[];
    dimensions: { field: string }[];
  },
  rows: Record<string, unknown>[],
): DataPoint[] {
  const metric = widget.metrics[0] ?? { measure: "count", agg: "count" };
  const metricField = `${metric.agg}_${metric.measure}`;
  const dimensionField = widget.dimensions[0]?.field ?? "none";
  const isTimeSeries = isTimeSeriesChart(widget.chartType);

  return rows.map((row) => {
    const timeDimension =
      typeof row.time_dimension === "string" ? row.time_dimension : undefined;
    if (widget.chartType === "PIVOT_TABLE") {
      return {
        dimension: widget.dimensions[0]?.field ?? "dimension",
        metric: 0, // Not used for pivot tables
        time_dimension: timeDimension,
        ...row,
      };
    }
    return toWidgetChartDataPoint({
      metricValue: row[metricField],
      metricField,
      aggregation: metric.agg,
      dimensionValue: row[dimensionField],
      timeDimension,
      isTimeSeries,
      dimensionLabelMap: undefined,
      normalizeHistogram: true,
    });
  });
}

/**
 * A dashboard widget's chart config for rendering: pivot tables get their
 * dimension and metric columns, units and sort; other charts their unit.
 */
export function toWidgetRenderChartConfig<TChartConfig extends object>(
  widget: {
    view: string;
    chartType: DashboardWidgetChartType;
    chartConfig: TChartConfig;
    metrics: WidgetMetric[];
    dimensions: { field: string }[];
  },
  params: {
    version: ViewVersion;
    defaultSort?: { column: string; order: "ASC" | "DESC" };
  },
) {
  const { view, metrics } = widget;
  return {
    ...widget.chartConfig,
    ...(widget.chartType === "PIVOT_TABLE" && {
      dimensions: widget.dimensions.map((dimension) => dimension.field),
      metrics: metrics.map((metric) => `${metric.agg}_${metric.measure}`),
      units: metrics.map((metric) =>
        getResultUnit(view, metric.measure, metric.agg, params.version),
      ),
      defaultSort: params.defaultSort,
    }),
    ...(widget.chartType !== "PIVOT_TABLE" && {
      unit: getResultUnit(
        view,
        metrics[0]?.measure ?? "",
        metrics[0]?.agg,
        params.version,
      ),
    }),
  };
}

/** How many rows a widget chart shows: all buckets of a time series. */
export const getWidgetRowLimit = (chartConfig: {
  type: DashboardWidgetChartType;
  row_limit?: number;
}) =>
  isTimeSeriesChart(chartConfig.type) ? 100 : (chartConfig.row_limit ?? 100);
