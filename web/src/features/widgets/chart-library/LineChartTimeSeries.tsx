import React, { useMemo } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  expandChartConfig,
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
  const enhancedConfig = useMemo(
    () => expandChartConfig(config, dimensions),
    [config, dimensions],
  );

  return (
    <ChartContainer config={enhancedConfig}>
      <LineChart accessibilityLayer={accessibilityLayer} data={groupedData}>
        <XAxis
          dataKey="time_dimension"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="number"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        {dimensions.map((dimension) => (
          <Line
            key={dimension}
            type="monotone"
            dataKey={dimension}
            strokeWidth={2}
            dot={true}
            activeDot={{ r: 6, strokeWidth: 0 }}
            stroke={"var(--color-" + dimension + ")"}
          />
        ))}
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
      </LineChart>
    </ChartContainer>
  );
};

export default LineChartTimeSeries;
