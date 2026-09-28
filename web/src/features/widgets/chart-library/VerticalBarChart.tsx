import { useMemo } from "react";

import { BarChart as DesignSystemBarChart } from "@/src/components/design-system/charts/BarChart/BarChart";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import { prepareCategoryBars } from "@/src/features/widgets/chart-library/prepareCategoryBars";
import {
  formatMetric,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";

export function VerticalBarChart({
  data,
  config,
  metricFormatter = formatMetric,
  hideXAxisLabels = false,
  colorBarsByCategory = false,
  legendPosition,
  zeroBaseline = false,
}: ChartProps) {
  const categoryBars = useMemo(
    () => (colorBarsByCategory ? prepareCategoryBars(data) : null),
    [colorBarsByCategory, data],
  );
  const chartData = useMemo(
    () =>
      (categoryBars?.rows ?? data).map((row, index) => ({
        label: row.dimension ?? "Unknown",
        value: typeof row.metric === "number" ? row.metric : null,
        color: categoryBars?.rows[index]?.fill,
      })),
    [categoryBars, data],
  );
  const formatValue = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

  return (
    <DesignSystemBarChart
      data={chartData}
      color={config?.metric?.color ?? "hsl(var(--chart-1))"}
      valueFormatter={formatValue}
      hideXAxisLabels={hideXAxisLabels}
      zeroBaseline={zeroBaseline}
      legend={
        colorBarsByCategory && legendPosition !== "none"
          ? {
              items: (categoryBars?.legend ?? []).map((item) => ({
                id: item.category,
                label: item.category,
                color: item.color,
              })),
            }
          : undefined
      }
    />
  );
}
