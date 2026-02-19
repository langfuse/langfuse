import React, { useState, useMemo } from "react";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
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

export const Chart = ({
  chartType,
  data,
  rowLimit,
  chartConfig,
  sortState,
  onSortChange,
  isLoading = false,
  valueFormatter,
  legendPosition,
  overrideWarning = false,
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
    defaultSort?: OrderByState;
    show_value_labels?: boolean;
    show_data_point_dots?: boolean;
    subtle_fill?: boolean;
  };
  sortState?: OrderByState | null;
  onSortChange?: (sortState: OrderByState | null) => void;
  isLoading?: boolean;
  valueFormatter?: (value: number) => string;
  legendPosition?: "above" | "none";
  overrideWarning?: boolean;
}) => {
  const [forceRender, setForceRender] = useState(overrideWarning);
  const shouldWarn = data.length > 2000 && !forceRender;

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

  const renderChart = () => {
    switch (chartType) {
      case "LINE_TIME_SERIES":
        return (
          <LineChartTimeSeries
            data={renderedData}
            valueFormatter={valueFormatter}
            legendPosition={legendPosition}
            showDataPointDots={chartConfig?.show_data_point_dots ?? true}
          />
        );
      case "AREA_TIME_SERIES":
        return (
          <AreaChartTimeSeries
            data={renderedData}
            valueFormatter={valueFormatter}
            legendPosition={legendPosition}
            subtleFill={chartConfig?.subtle_fill}
          />
        );
      case "BAR_TIME_SERIES":
        return (
          <VerticalBarChartTimeSeries
            data={renderedData}
            valueFormatter={valueFormatter}
            subtleFill={chartConfig?.subtle_fill}
          />
        );
      case "HORIZONTAL_BAR":
        return (
          <HorizontalBarChart
            data={renderedData.slice(0, rowLimit)}
            showValueLabels={chartConfig?.show_value_labels}
            valueFormatter={valueFormatter}
            subtleFill={chartConfig?.subtle_fill}
          />
        );
      case "VERTICAL_BAR":
        return (
          <VerticalBarChart
            data={renderedData.slice(0, rowLimit)}
            valueFormatter={valueFormatter}
            subtleFill={chartConfig?.subtle_fill}
          />
        );
      case "PIE":
        return (
          <PieChart
            data={renderedData.slice(0, rowLimit)}
            valueFormatter={valueFormatter}
            subtleFill={chartConfig?.subtle_fill}
          />
        );
      case "HISTOGRAM":
        return (
          <HistogramChart
            data={renderedData}
            subtleFill={chartConfig?.subtle_fill}
          />
        );
      case "NUMBER": {
        return <BigNumber data={renderedData} />;
      }
      case "PIVOT_TABLE": {
        // Extract pivot table configuration from chartConfig
        const pivotConfig = {
          dimensions: chartConfig?.dimensions ?? [],
          metrics: chartConfig?.metrics ?? ["metric"], // Use metrics from chartConfig
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
            valueFormatter={valueFormatter}
          />
        );
    }
  };

  const renderWarning = () => (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <AlertCircle className="mb-4 h-12 w-12" />
      <h3 className="mb-2 text-lg font-semibold">Large Dataset Warning</h3>
      <p className="mb-6 text-sm text-muted-foreground">
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
