import React from "react";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { CardContent } from "@/src/components/ui/card";
import LineChartTimeSeries from "@/src/features/widgets/chart-library/LineChartTimeSeries";
import VerticalBarChartTimeSeries from "@/src/features/widgets/chart-library/VerticalBarChartTimeSeries";
import HorizontalBarChart from "@/src/features/widgets/chart-library/HorizontalBarChart";
import VerticalBarChart from "@/src/features/widgets/chart-library/VerticalBarChart";
import PieChart from "@/src/features/widgets/chart-library/PieChart";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";

export const Chart = ({
  chartType,
  data,
  rowLimit,
}: {
  chartType: DashboardWidgetChartType;
  data: DataPoint[];
  rowLimit: number;
}) => {
  return (
    <CardContent>
      {(() => {
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
      })()}
    </CardContent>
  );
};
