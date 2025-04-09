import React from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";

/**
 * HorizontalBarChart component
 * @param data - Data to be displayed. Expects an array of objects with dimension and metric properties.
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
  return (
    <ChartContainer config={config}>
      <BarChart
        accessibilityLayer={accessibilityLayer}
        data={data}
        layout="vertical"
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
          dataKey="dimension"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <Bar
          dataKey="metric"
          radius={[0, 4, 4, 0]}
          className="fill-[--color-metric]"
        />
        <ChartTooltip
          content={<ChartTooltipContent />}
          cursor={{ opacity: 0.8 }}
        />
      </BarChart>
    </ChartContainer>
  );
};

export default HorizontalBarChart;
