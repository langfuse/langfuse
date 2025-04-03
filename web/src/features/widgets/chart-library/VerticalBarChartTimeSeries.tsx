import React, { useMemo } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartConfig,
} from "@/src/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartProps,
  type DataPoint,
} from "@/src/features/widgets/chart-library/chart-props";

/**
 * VerticalBarChartTimeSeries component
 * @param data - Data to be displayed. Expects an array of objects with time_dimension, dimension, and metric properties.
 * @param config - Configuration object for the chart. Can include theme settings for light and dark modes.
 * @param accessibilityLayer - Boolean to enable or disable the accessibility layer. Default is true.
 */
export const VerticalBarChartTimeSeries: React.FC<ChartProps> = ({
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
  // Group data by dimension to create multiple bar series
  const groupedData = useMemo(() => {
    // First, group by time_dimension
    const timeGroups: any = data.reduce(
      (acc: any, item: DataPoint) => {
        const time = item.time_dimension || "Unknown";
        if (!acc[time]) {
          acc[time] = {};
        }

        const dimension = item.dimension || "Unknown";
        acc[time][dimension] = item.metric;

        return acc;
      },
      {} as Record<string, Record<string, number>>,
    );

    // Convert to array format for Recharts
    return Object.entries(timeGroups).map(([time, dimensions]) => ({
      time_dimension: time,
      ...(dimensions as any),
    }));
  }, [data]);

  // Get unique dimensions for creating bars
  const dimensions = useMemo(() => {
    const uniqueDimensions = new Set<string>();
    data.forEach((item: DataPoint) => {
      if (item.dimension) {
        uniqueDimensions.add(item.dimension);
      }
    });
    return Array.from(uniqueDimensions);
  }, [data]);

  // Create a color config for each dimension
  const enhancedConfig = useMemo(() => {
    const result: any = { ...config };

    // Add colors for each dimension
    dimensions.forEach((dimension, index) => {
      const colorIndex = (index % 4) + 1; // We have 4 chart colors defined in CSS
      result[dimension] = {
        color: `hsl(var(--chart-${colorIndex}))`,
      };
    });

    return result as ChartConfig;
  }, [config, dimensions]);

  return (
    <ChartContainer config={enhancedConfig}>
      <BarChart accessibilityLayer={accessibilityLayer} data={groupedData}>
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
        {dimensions.map((dimension, index) => (
          <Bar
            key={dimension}
            dataKey={dimension}
            fill={"var(--color-" + dimension + ")"}
            // Stack bars if there are multiple dimensions
            stackId={dimensions.length > 1 ? "stack" : undefined}
          />
        ))}
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
      </BarChart>
    </ChartContainer>
  );
};

export default VerticalBarChartTimeSeries;
