import React, { useState, useMemo } from "react";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { CardContent } from "@/src/components/ui/card";
import LineChartTimeSeries from "@/src/features/widgets/chart-library/LineChartTimeSeries";
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

export const Chart = ({
  chartType,
  data,
  rowLimit,
  chartConfig,
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
  };
}) => {
  const [forceRender, setForceRender] = useState(false);
  const shouldWarn = data.length > 2000 && !forceRender;

  const renderedData = useMemo(() => {
    return data.map((item) => {
      return {
        ...item,
        time_dimension: item.time_dimension
          ? new Date(item.time_dimension).toLocaleTimeString("en-US", {
              year: "2-digit",
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : undefined,
      };
    });
  }, [data]);

  const renderChart = () => {
    switch (chartType) {
      case "LINE_TIME_SERIES":
        return <LineChartTimeSeries data={renderedData} />;
      case "BAR_TIME_SERIES":
        return <VerticalBarChartTimeSeries data={renderedData} />;
      case "HORIZONTAL_BAR":
        return <HorizontalBarChart data={renderedData.slice(0, rowLimit)} />;
      case "VERTICAL_BAR":
        return <VerticalBarChart data={renderedData.slice(0, rowLimit)} />;
      case "PIE":
        return <PieChart data={renderedData.slice(0, rowLimit)} />;
      case "HISTOGRAM":
        return <HistogramChart data={renderedData} />;
      case "NUMBER": {
        return <BigNumber data={renderedData} />;
      }
      case "PIVOT_TABLE": {
        // Extract pivot table configuration from chartConfig
        const pivotConfig = {
          dimensions: chartConfig?.dimensions ?? [],
          metrics: chartConfig?.metrics ?? ["metric"], // Use metrics from chartConfig
          rowLimit: chartConfig?.row_limit ?? rowLimit,
        };
        return <PivotTable data={renderedData} config={pivotConfig} />;
      }
      default:
        return <HorizontalBarChart data={renderedData.slice(0, rowLimit)} />;
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
