import React, { useMemo } from "react";
import { ChartContainer, ChartTooltip } from "@/src/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatAxisLabel,
  groupDataByFirstDimension,
  getUniqueDimensions,
} from "@/src/features/widgets/chart-library/utils";

/**
 * HorizontalBarChart component with multi-dimensional breakdown support
 *
 * @param data - Data to be displayed. Expects DataPoint[] with dimensions array
 * @param config - Configuration object for the chart. Can include theme settings for light and dark modes.
 * @param accessibilityLayer - Boolean to enable or disable the accessibility layer. Default is true.
 */
export const HorizontalBarChart: React.FC<ChartProps> = ({
  data,
  config = {
    metric: {
      theme: {
        light: "hsl(var(--chart-1))",
        dark: "hsl(var(--chart-1))",
      },
    },
  },
  accessibilityLayer = true,
}) => {
  // Group data by first dimension (categories)
  const groupedData = useMemo(() => groupDataByFirstDimension(data), [data]);
  const dimensions = useMemo(() => getUniqueDimensions(data), [data]);

  return (
    <ChartContainer config={config}>
      <BarChart
        layout="vertical"
        accessibilityLayer={accessibilityLayer}
        data={groupedData}
      >
        <XAxis
          type="number"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatAxisLabel}
          width={90}
        />
        {dimensions.map((dimension, index) => (
          <Bar
            key={dimension}
            dataKey={dimension}
            fill={`hsl(var(--chart-${(index % 4) + 1}))`}
            name={dimension}
            radius={[0, 4, 4, 0]}
          />
        ))}
        <ChartTooltip
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          itemStyle={{ color: "hsl(var(--foreground))" }}
        />
      </BarChart>
    </ChartContainer>
  );
};

export default HorizontalBarChart;
