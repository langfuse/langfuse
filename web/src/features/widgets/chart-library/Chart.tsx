import React, { useState } from "react";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { CardContent } from "@/src/components/ui/card";
import LineChartTimeSeries from "@/src/features/widgets/chart-library/LineChartTimeSeries";
import VerticalBarChartTimeSeries from "@/src/features/widgets/chart-library/VerticalBarChartTimeSeries";
import HorizontalBarChart from "@/src/features/widgets/chart-library/HorizontalBarChart";
import VerticalBarChart from "@/src/features/widgets/chart-library/VerticalBarChart";
import PieChart from "@/src/features/widgets/chart-library/PieChart";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { Button } from "@/src/components/ui/button";
import { AlertCircle } from "lucide-react";

export const Chart = ({
  chartType,
  data,
  rowLimit,
}: {
  chartType: DashboardWidgetChartType;
  data: DataPoint[];
  rowLimit: number;
}) => {
  const [forceRender, setForceRender] = useState(false);
  const shouldWarn = data.length > 2000 && !forceRender;

  const renderChart = () => {
    switch (chartType) {
      case "LINE_TIME_SERIES":
        return <LineChartTimeSeries data={data} />;
      case "BAR_TIME_SERIES":
        return <VerticalBarChartTimeSeries data={data} />;
      case "HORIZONTAL_BAR":
        return <HorizontalBarChart data={data.slice(0, rowLimit)} />;
      case "VERTICAL_BAR":
        return <VerticalBarChart data={data.slice(0, rowLimit)} />;
      case "PIE":
        return <PieChart data={data.slice(0, rowLimit)} />;
      default:
        return <HorizontalBarChart data={data.slice(0, rowLimit)} />;
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
    <CardContent>{shouldWarn ? renderWarning() : renderChart()}</CardContent>
  );
};
