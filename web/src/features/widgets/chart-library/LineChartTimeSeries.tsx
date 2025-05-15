import React, { useMemo } from "react";
import { ChartContainer, ChartTooltip } from "@/src/components/ui/chart";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  getUniqueDimensions,
  groupDataByTimeDimension,
} from "@/src/features/widgets/chart-library/utils";

/**
 * LineChartTimeSeries component
 * @param data - Data to be displayed. Expects an array of objects with time_dimension, dimension, and metric properties.
 * @param config - Configuration object for the chart. Can include theme settings for light and dark modes.
 * @param accessibilityLayer - Boolean to enable or disable the accessibility layer. Default is true.
 */
export const LineChartTimeSeries: React.FC<ChartProps> = ({
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
  const groupedData = useMemo(() => groupDataByTimeDimension(data), [data]);
  const dimensions = useMemo(() => getUniqueDimensions(data), [data]);

  return (
    <ChartContainer config={config}>
      <LineChart accessibilityLayer={accessibilityLayer} data={groupedData}>
        <XAxis
          dataKey="time_dimension"
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
        {dimensions.map((dimension, index) => (
          <Line
            key={dimension}
            type="monotone"
            dataKey={dimension}
            strokeWidth={2}
            dot={true}
            activeDot={{ r: 6, strokeWidth: 0 }}
            stroke={`hsl(var(--chart-${(index % 4) + 1}))`}
          />
        ))}
        <ChartTooltip
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
        />
      </LineChart>
    </ChartContainer>
  );
};

export default LineChartTimeSeries;
