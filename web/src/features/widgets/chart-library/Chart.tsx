import React from "react";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { CardContent } from "@/src/components/ui/card";
import LineChartTimeSeries from "@/src/features/widgets/chart-library/LineChartTimeSeries";
import VerticalBarChartTimeSeries from "@/src/features/widgets/chart-library/VerticalBarChartTimeSeries";
import HorizontalBarChart from "@/src/features/widgets/chart-library/HorizontalBarChart";
import VerticalBarChart from "@/src/features/widgets/chart-library/VerticalBarChart";
import PieChart from "@/src/features/widgets/chart-library/PieChart";

export const Chart = ({
  chartType,
  data,
  rowLimit,
}: {
  chartType: string;
  data: DataPoint[];
  rowLimit: number;
}) => {
  return (
    <CardContent>
      {(() => {
        switch (chartType) {
          case "line-time-series":
            return <LineChartTimeSeries data={data} />;
          case "bar-time-series":
            return <VerticalBarChartTimeSeries data={data} />;
          case "bar-horizontal":
            return <HorizontalBarChart data={data.slice(0, rowLimit)} />;
          case "bar-vertical":
            return <VerticalBarChart data={data.slice(0, rowLimit)} />;
          case "pie":
            return <PieChart data={data.slice(0, rowLimit)} />;
          default:
            return <HorizontalBarChart data={data.slice(0, rowLimit)} />;
        }
      })()}
    </CardContent>
  );
};
