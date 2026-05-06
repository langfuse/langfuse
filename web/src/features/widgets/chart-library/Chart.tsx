import React, { useState, useMemo } from "react";
import {
  type FormatMetricOptions,
  type MetricFormatterFunction,
  type DataPoint,
} from "@/src/features/widgets/chart-library/chart-props";
import { formatMetric } from "@/src/features/widgets/chart-library/utils";
import { CardContent } from "@/src/components/ui/card";
import LineChartTimeSeries from "@/src/features/widgets/chart-library/LineChartTimeSeries";
import AreaChartTimeSeries from "@/src/features/widgets/chart-library/AreaChartTimeSeries";
import VerticalBarChartTimeSeries from "@/src/features/widgets/chart-library/VerticalBarChartTimeSeries";
import HorizontalBarChart from "@/src/features/widgets/chart-library/HorizontalBarChart";
import VerticalBarChart from "@/src/features/widgets/chart-library/VerticalBarChart";
import PieChart from "@/src/features/widgets/chart-library/PieChart";
import HistogramChart from "@/src/features/widgets/chart-library/HistogramChart";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { Button } from "@/src/components/ui/button";
import { AlertCircle } from "lucide-react";
import { BigNumber } from "@/src/features/widgets/chart-library/BigNumber";
import { PivotTable } from "@/src/features/widgets/chart-library/PivotTable";
import { type OrderByState } from "@langfuse/shared";
import { type ChartConfig } from "@/src/components/ui/chart";

const DEFAULT_METRIC_THEME = {
  light: "hsl(var(--chart-1))",
  dark: "hsl(var(--chart-1))",
} as const;

export const Chart = ({
  chartType,
  data,
  rowLimit,
  chartConfig,
  config,
  sortState,
  onSortChange,
  isLoading = false,
  legendPosition,
  overrideWarning = false,
  metricFormatter: metricFormatterOverride,
}: {
  chartType: DashboardWidgetChartType;
  data: DataPoint[];
  rowLimit: number;
  chartConfig?: {
    type: DashboardWidgetChartType;
    row_limit?: number;
    bins?: number;
    dimensions?: string[];
    metrics?: string[];
    units?: (string | undefined)[];
    unit?: string | undefined;
    defaultSort?: OrderByState;
    show_value_labels?: boolean;
    show_data_point_dots?: boolean;
    subtle_fill?: boolean;
  };
  config?: ChartConfig;
  sortState?: OrderByState | null;
  onSortChange?: (sortState: OrderByState | null) => void;
  isLoading?: boolean;
  legendPosition?: "above" | "none";
  overrideWarning?: boolean;
  metricFormatter?: MetricFormatterFunction;
}) => {
  const [forceRender, setForceRender] = useState(overrideWarning);
  const shouldWarn = data.length > 2000 && !forceRender;

  const metricFormatter = useMemo(
    () =>
      metricFormatterOverride ??
      ((value: number, options: FormatMetricOptions) =>
        formatMetric(value, { ...options, unit: chartConfig?.unit })),
    [metricFormatterOverride, chartConfig?.unit],
  );

  const renderedData = useMemo(() => {
    return data.map((item) => {
      if (!item.time_dimension) return { ...item, time_dimension: undefined };
      const value = item.time_dimension;
      const looksLikeIso =
        value.includes("T") || /^\d{4}-\d{2}-\d{2}$/.test(value);
      if (!looksLikeIso) {
        return { ...item, time_dimension: value };
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return { ...item };
      const isMidnight =
        parsed.getUTCHours() === 0 &&
        parsed.getUTCMinutes() === 0 &&
        parsed.getUTCSeconds() === 0 &&
        parsed.getUTCMilliseconds() === 0;
      const time_dimension = isMidnight
        ? parsed.toLocaleDateString("en-US", {
            year: "2-digit",
            month: "numeric",
            day: "numeric",
          })
        : parsed.toLocaleTimeString("en-US", {
            year: "2-digit",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
      return { ...item, time_dimension };
    });
  }, [data]);

  const resolvedConfig = useMemo(() => {
    if (!config) return undefined;

    return Object.fromEntries(
      Object.entries(config).map(([key, value]) => {
        if (value.theme || value.color) {
          return [key, value];
        }

        return [
          key,
          {
            ...value,
            theme: DEFAULT_METRIC_THEME,
          },
        ];
      }),
    ) as ChartConfig;
  }, [config]);

  const renderChart = () => {
    switch (chartType) {
      case "LINE_TIME_SERIES":
        return (
          <LineChartTimeSeries
            data={renderedData}
            config={resolvedConfig}
            metricFormatter={metricFormatter}
            legendPosition={legendPosition}
            showDataPointDots={chartConfig?.show_data_point_dots ?? true}
          />
        );
      case "AREA_TIME_SERIES":
        return (
          <AreaChartTimeSeries
            data={renderedData}
            config={resolvedConfig}
            metricFormatter={metricFormatter}
            legendPosition={legendPosition}
            subtleFill={chartConfig?.subtle_fill}
          />
        );
      case "BAR_TIME_SERIES":
        return (
          <VerticalBarChartTimeSeries
            data={renderedData}
            config={resolvedConfig}
            metricFormatter={metricFormatter}
            subtleFill={chartConfig?.subtle_fill}
          />
        );
      case "HORIZONTAL_BAR":
        return (
          <HorizontalBarChart
            data={renderedData.slice(0, rowLimit)}
            config={resolvedConfig}
            showValueLabels={chartConfig?.show_value_labels}
            metricFormatter={metricFormatter}
            subtleFill={chartConfig?.subtle_fill}
          />
        );
      case "VERTICAL_BAR":
        return (
          <VerticalBarChart
            data={renderedData.slice(0, rowLimit)}
            config={resolvedConfig}
            metricFormatter={metricFormatter}
            subtleFill={chartConfig?.subtle_fill}
          />
        );
      case "PIE":
        return (
          <PieChart
            data={renderedData.slice(0, rowLimit)}
            config={resolvedConfig}
            metricFormatter={metricFormatter}
            subtleFill={chartConfig?.subtle_fill}
          />
        );
      case "HISTOGRAM":
        return (
          <HistogramChart
            data={renderedData}
            config={resolvedConfig}
            metricFormatter={metricFormatter}
            subtleFill={chartConfig?.subtle_fill}
          />
        );
      case "NUMBER": {
        return (
          <BigNumber
            data={renderedData}
            config={resolvedConfig}
            metricFormatter={metricFormatter}
          />
        );
      }
      case "PIVOT_TABLE": {
        // Extract pivot table configuration from chartConfig
        const pivotConfig = {
          dimensions: chartConfig?.dimensions ?? [],
          metrics: chartConfig?.metrics ?? ["metric"], // Use metrics from chartConfig
          units: chartConfig?.units,
          rowLimit: chartConfig?.row_limit ?? rowLimit,
          defaultSort: chartConfig?.defaultSort,
        };
        return (
          <PivotTable
            data={renderedData}
            config={pivotConfig}
            sortState={sortState}
            onSortChange={onSortChange}
            isLoading={isLoading}
          />
        );
      }
      default:
        return (
          <HorizontalBarChart
            data={renderedData.slice(0, rowLimit)}
            showValueLabels={chartConfig?.show_value_labels}
            metricFormatter={metricFormatter}
          />
        );
    }
  };

  const renderWarning = () => (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <AlertCircle className="mb-4 h-12 w-12" />
      <h3 className="mb-2 text-lg font-semibold">Large Dataset Warning</h3>
      <p className="text-muted-foreground mb-6 text-sm">
        This chart has more than 2,000 unique data points. Rendering it may be
        slow or may crash your browser. Try to reduce the number of dimensions
        by adding more selective filters or choosing a coarser breakdown
        dimension.
      </p>
      <Button
        variant="outline"
        onClick={() => setForceRender(true)}
        className="font-medium"
      >
        I understand, proceed to render the chart
      </Button>
    </div>
  );

  return (
    <CardContent className="h-full p-0">
      {shouldWarn ? renderWarning() : renderChart()}
    </CardContent>
  );
};
