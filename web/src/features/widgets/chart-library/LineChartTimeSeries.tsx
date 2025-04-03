import React, { useMemo } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/src/components/ui/chart";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartProps } from "@/src/features/widgets/chart-library/chart-props";

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
  // Group data by dimension to create multiple lines
  const groupedData = useMemo(() => {
    // First, group by time_dimension
    const timeGroups = data.reduce((acc, item) => {
      const time = item.time_dimension || "Unknown";
      if (!acc[time]) {
        acc[time] = {};
      }
      
      const dimension = item.dimension || "Unknown";
      acc[time][dimension] = item.metric;
      
      return acc;
    }, {} as Record<string, Record<string, number>>);
    
    // Convert to array format for Recharts
    return Object.entries(timeGroups).map(([time, dimensions]) => ({
      time_dimension: time,
      ...dimensions,
    }));
  }, [data]);
  
  // Get unique dimensions for creating lines
  const dimensions = useMemo(() => {
    const uniqueDimensions = new Set<string>();
    data.forEach(item => {
      if (item.dimension) {
        uniqueDimensions.add(item.dimension);
      }
    });
    return Array.from(uniqueDimensions);
  }, [data]);
  
  // Create a color config for each dimension
  const enhancedConfig = useMemo(() => {
    const result = { ...config };
    
    // Add colors for each dimension
    dimensions.forEach((dimension, index) => {
      const colorIndex = (index % 5) + 1; // We have 5 chart colors defined in CSS
      result[dimension] = {
        theme: {
          light: `hsl(var(--chart-${colorIndex}))`,
          dark: `hsl(var(--chart-${colorIndex}))`,
        },
      };
    });
    
    return result;
  }, [config, dimensions]);

  return (
    <ChartContainer config={enhancedConfig}>
      <LineChart
        accessibilityLayer={accessibilityLayer}
        data={groupedData}
      >
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
            className={`stroke-[--color-${dimension}]`}
          />
        ))}
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) =>
                Intl.NumberFormat("en-US")
                  .format(value as number)
                  .toString()
              }
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  );
};

export default LineChartTimeSeries;