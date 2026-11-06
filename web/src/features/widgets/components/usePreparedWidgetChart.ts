import { useMemo } from "react";
import {
  type DashboardWidgetChartType,
  type OrderByState,
} from "@langfuse/shared";
import {
  type ChartProps,
  type FormatMetricOptions,
} from "../chart-library/chart-props";
import { type WidgetChartConfig } from "../utils";
import { formatMetric } from "../chart-library/utils";
import { useLineChartTimeSeries } from "../chart-library/useLineChartTimeSeries";
import { useAreaChartTimeSeries } from "../chart-library/useAreaChartTimeSeries";
import { useVerticalBarChartTimeSeries } from "../chart-library/useVerticalBarChartTimeSeries";
import { useTopListChart } from "../chart-library/useTopListChart";
import { useVerticalBarChart } from "../chart-library/useVerticalBarChart";
import { usePieChart } from "../chart-library/usePieChart";
import { useHistogramChart } from "../chart-library/useHistogramChart";
import { usePivotTable } from "../chart-library/usePivotTable";
import {
  useLargeDatasetGuard,
  LARGE_DATASET_CONFIRMATION,
} from "../chart-library/useLargeDatasetGuard";

const EMPTY_DATA: ChartProps["data"] = [];

export function usePreparedWidgetChart({
  chartType,
  data,
  chartConfig,
  active: requestedActive,
  overrideWarning = false,
  rowLimit = 100,
  label,
  unit,
  config,
  sortState,
  onSortChange,
  ...chart
}: ChartProps & {
  chartType?: DashboardWidgetChartType;
  chartConfig?: WidgetChartConfig & {
    dimensions?: string[];
    metrics?: string[];
    units?: (string | undefined)[];
    unit?: string;
  };
  active: boolean;
  overrideWarning?: boolean;
  rowLimit?: number;
  label?: string;
  unit?: string;
  sortState?: OrderByState | null;
  onSortChange?: (sortState: OrderByState | null) => void;
}) {
  const { shouldWarn, proceed } = useLargeDatasetGuard(
    data.length,
    overrideWarning,
  );
  const active = requestedActive && !shouldWarn;
  const resolvedConfig = useMemo(() => {
    const source = config ?? (label ? { metric: { label } } : undefined);
    if (!source) return undefined;
    return Object.fromEntries(
      Object.entries(source).map(([key, value]) => {
        if (value.theme || value.color) return [key, value];
        return [
          key,
          {
            ...value,
            theme: {
              light: "hsl(var(--chart-1))",
              dark: "hsl(var(--chart-1))",
            },
          },
        ];
      }),
    ) as NonNullable<ChartProps["config"]>;
  }, [config, label]);
  const resolvedUnit = unit ?? chartConfig?.unit;
  const metricFormatter = useMemo(
    () =>
      chart.metricFormatter ??
      ((value: number, options: FormatMetricOptions) =>
        formatMetric(value, { ...options, unit: resolvedUnit })),
    [chart.metricFormatter, resolvedUnit],
  );
  const common = { ...chart, config: resolvedConfig, metricFormatter };
  const preparedCharts = {
    LINE_TIME_SERIES: useLineChartTimeSeries({
      ...common,
      data: active && chartType === "LINE_TIME_SERIES" ? data : EMPTY_DATA,
      showDataPointDots: chartConfig?.show_data_point_dots ?? false,
    }),
    AREA_TIME_SERIES: useAreaChartTimeSeries({
      ...common,
      data: active && chartType === "AREA_TIME_SERIES" ? data : EMPTY_DATA,
    }),
    BAR_TIME_SERIES: useVerticalBarChartTimeSeries({
      ...common,
      data: active && chartType === "BAR_TIME_SERIES" ? data : EMPTY_DATA,
    }),
    HORIZONTAL_BAR: useTopListChart({
      ...common,
      data:
        active && chartType === "HORIZONTAL_BAR"
          ? data.slice(0, rowLimit)
          : EMPTY_DATA,
    }),
    VERTICAL_BAR: useVerticalBarChart({
      ...common,
      data:
        active && chartType === "VERTICAL_BAR"
          ? data.slice(0, rowLimit)
          : EMPTY_DATA,
    }),
    PIE: usePieChart({
      metricFormatter,
      data:
        active && chartType === "PIE" ? data.slice(0, rowLimit) : EMPTY_DATA,
    }),
    HISTOGRAM: useHistogramChart({
      ...common,
      data: active && chartType === "HISTOGRAM" ? data : EMPTY_DATA,
    }),
    PIVOT_TABLE: usePivotTable({
      data: active && chartType === "PIVOT_TABLE" ? data : EMPTY_DATA,
      config: {
        dimensions: chartConfig?.dimensions ?? [],
        metrics: chartConfig?.metrics ?? ["metric"],
        units: chartConfig?.units,
        rowLimit: chartConfig?.row_limit ?? rowLimit,
        defaultSort: chartConfig?.defaultSort,
      },
      sortState,
      onSortChange:
        active && chartType === "PIVOT_TABLE" ? onSortChange : undefined,
    }),
    NUMBER: {
      visualization: {
        type: "number" as const,
        value: data.reduce(
          (sum, point) =>
            sum + (typeof point.metric === "number" ? point.metric : 0),
          0,
        ),
        valueFormatter: metricFormatter,
      },
    },
  };
  return {
    ...preparedCharts[chartType ?? "NUMBER"],
    confirmation: shouldWarn
      ? { ...LARGE_DATASET_CONFIRMATION, onConfirm: proceed }
      : undefined,
  };
}
