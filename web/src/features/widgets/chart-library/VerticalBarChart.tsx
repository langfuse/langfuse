import React from "react";
import { ChartContainer, ChartTooltip } from "@/src/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";

/**
 * VerticalBarChart component
 * @param data - Data to be displayed. Expects an array of objects with dimension and metric properties.
 * @param config - Configuration object for the chart. Can include theme settings for light and dark modes.
 * @param accessibilityLayer - Boolean to enable or disable the accessibility layer. Default is true.
 */
export const VerticalBarChart: React.FC<ChartProps> = ({
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
  return (
    <ChartContainer config={config}>
      <BarChart accessibilityLayer={accessibilityLayer} data={data}>
        <XAxis
          type="category"
          dataKey="dimension"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="number"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <Bar
          dataKey="metric"
          radius={[4, 4, 0, 0]}
          className="fill-[--color-metric]"
        />
        <ChartTooltip
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          itemStyle={{ color: "hsl(var(--foreground))" }}
        />
      </BarChart>
    </ChartContainer>
  );
};

export default VerticalBarChart;
