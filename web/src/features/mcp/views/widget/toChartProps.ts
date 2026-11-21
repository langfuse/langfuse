import { type ComponentProps } from "react";
import { getResultUnit } from "@langfuse/shared/query";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  isTimeSeriesChart,
  parseMetricUnit,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import { type WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import { toWidgetChartDataPoint } from "@/src/features/widgets/fns/toWidgetChartDataPoint";
import {
  getWidgetMetricPresentation,
  getWidgetMissingBucketValue,
} from "@/src/features/widgets/utils";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";

/** A widget definition with its query rows, sent in `renderWidget` result `_meta.widget`. */
export type WidgetPayload = {
  title: string;
  description?: string;
  chartType: DashboardWidgetChartType;
  chartConfig: {
    type: DashboardWidgetChartType;
    row_limit?: number;
    bins?: number;
    defaultSort?: { column: string; order: "ASC" | "DESC" };
  };
  view: string;
  version: "v1" | "v2";
  metrics: { measure: string; agg: string }[];
  dimensions: { field: string }[];
  rows: Record<string, unknown>[];
  /** NUMBER widgets: the value, the previous period's value and a trend. */
  kpi?: {
    value: number | null;
    previousValue: number | null;
    trendRows: Record<string, unknown>[];
  };
  timeRangeLabel: string;
};

type ChartCardProps = Extract<
  ComponentProps<typeof WidgetChartCard>,
  { chartType: unknown; data: unknown }
>;

/**
 * Maps a `renderWidget` payload to `WidgetChartCard` props, mirroring how a
 * dashboard tile (`DashboardWidget`) prepares its query rows.
 */
export function toChartProps(
  payload: WidgetPayload,
): Omit<ChartCardProps, "title" | "description" | "tabs" | "actions"> {
  const metric = payload.metrics[0] ?? { measure: "count", agg: "count" };
  const metricField = `${metric.agg}_${metric.measure}`;
  const dimensionField = payload.dimensions[0]?.field ?? "none";
  const version = payload.version;
  const isPivot = payload.chartType === "PIVOT_TABLE";
  const presentation = isPivot
    ? undefined
    : getWidgetMetricPresentation({ metric, view: payload.view, version });
  const unit = getResultUnit(payload.view, metric.measure, metric.agg, version);

  const toPoints = (
    rows: Record<string, unknown>[],
    isTimeSeries: boolean,
  ): DataPoint[] =>
    rows.map((row) => {
      const timeDimension =
        typeof row.time_dimension === "string" ? row.time_dimension : undefined;
      if (isPivot) {
        return {
          dimension: payload.dimensions[0]?.field ?? "dimension",
          metric: 0,
          time_dimension: timeDimension,
          ...row,
        } as DataPoint;
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

  const shared = {
    config: presentation
      ? { metric: { label: presentation.label } }
      : undefined,
    metricFormatter: presentation?.metricFormatter,
    missingValue: getWidgetMissingBucketValue(metric.agg),
  };

  // A number reads as a KPI: the value on top, its trend charted below, the
  // way the home dashboard's summary cards look.
  if (payload.kpi && payload.kpi.trendRows.length > 1) {
    const { value, previousValue } = payload.kpi;
    return {
      ...shared,
      chartType: "AREA_TIME_SERIES",
      data: toPoints(payload.kpi.trendRows, true),
      chartConfig: { type: "AREA_TIME_SERIES", unit },
      metric: {
        value:
          value === null
            ? "–"
            : toFullMetricString(
                formatMetric(value, {
                  unit: parseMetricUnit(unit),
                  style: "full",
                }),
              ),
        description: describeChange(value, previousValue, unit),
      },
    };
  }

  const chartConfig = isPivot
    ? {
        ...payload.chartConfig,
        dimensions: payload.dimensions.map((d) => d.field),
        metrics: payload.metrics.map((m) => `${m.agg}_${m.measure}`),
        units: payload.metrics.map((m) =>
          getResultUnit(payload.view, m.measure, m.agg, version),
        ),
      }
    : { ...payload.chartConfig, unit };

  return {
    ...shared,
    chartType: payload.chartType,
    data: toPoints(payload.rows, isTimeSeriesChart(payload.chartType)),
    chartConfig,
    rowLimit: isTimeSeriesChart(payload.chartType)
      ? 100
      : (payload.chartConfig.row_limit ?? 100),
  };
}

function describeChange(
  value: number | null,
  previousValue: number | null,
  unit: string | undefined,
): string | undefined {
  if (value === null || previousValue === null) return undefined;
  const previous = toFullMetricString(
    formatMetric(previousValue, {
      unit: parseMetricUnit(unit),
      style: "full",
    }),
  );
  if (previousValue === 0) return `previous period: ${previous}`;
  const change = (value - previousValue) / Math.abs(previousValue);
  let arrow = "";
  if (change > 0) arrow = "▲";
  if (change < 0) arrow = "▼";
  return `${arrow} ${Math.abs(change * 100).toFixed(1)}% vs previous period (${previous})`.trim();
}
