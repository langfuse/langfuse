import React, { useMemo } from "react";
import { PieChart as DesignSystemPieChart } from "@/src/components/design-system/charts/PieChart/PieChart";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";

/**
 * PieChart component
 * @param data - Data to be displayed. Expects an array of objects with dimension and metric properties.
 */
export const PieChart: React.FC<
  Pick<ChartProps, "data" | "metricFormatter" | "subtleFill">
> = ({
  data,
  metricFormatter = (value, options) => formatMetric(value, options),
  subtleFill = false,
}) => {
  const formatValue = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

  const chartData = useMemo(() => {
    return data.map((item) => ({
      label: item.dimension || "Unknown",
      value: typeof item.metric === "number" ? item.metric : 0,
    }));
  }, [data]);

  return (
    <DesignSystemPieChart
      data={chartData}
      valueFormatter={formatValue}
      variant={subtleFill ? "subtle" : "default"}
    />
  );
};
