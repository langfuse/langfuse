import React, { useMemo } from "react";
import { ChartContainer, ChartTooltip } from "@/src/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import { formatAxisLabel } from "@/src/features/widgets/chart-library/utils";
import {
  groupDataForGroupedBars,
  getSubGroupKeys,
  getDimensionCount,
  enrichDataWithDimensions,
} from "@/src/features/widgets/chart-library/utils";

/**
 * Enhanced HorizontalBarChart component with multi-dimensional breakdown support
 *
 * Auto-detects dimension count and renders appropriately:
 * - Single dimension: Traditional single bar per category
 * - Multi-dimensional: Grouped bars with sub-categories and legend
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
  // Auto-detect dimension count for rendering logic
  const dimensionCount = useMemo(() => {
    return getDimensionCount(data);
  }, [data]);

  // Process data based on dimension count
  const processedData = useMemo(() => {
    if (dimensionCount > 1) {
      // Multi-dimensional: group data for grouped bars
      const enrichedData = enrichDataWithDimensions(data);
      return groupDataForGroupedBars(enrichedData);
    } else {
      // Single or no dimensions: use existing structure
      return data.map((item, index) => ({
        name: item.dimensions?.[0] || "Unknown",
        value: item.metric as number,
        fill: `hsl(var(--chart-${(index % 4) + 1}))`,
      }));
    }
  }, [data, dimensionCount]);

  // Get sub-group keys for multi-dimensional rendering
  const subGroupKeys = useMemo(() => {
    if (dimensionCount > 1) {
      return getSubGroupKeys(processedData);
    }
    return [];
  }, [processedData, dimensionCount]);

  const renderChart = () => {
    if (dimensionCount > 1) {
      // Multi-dimensional grouped bars (horizontal layout)
      return (
        <BarChart
          data={processedData}
          layout="vertical"
          accessibilityLayer={accessibilityLayer}
        >
          <CartesianGrid strokeDasharray="3 3" />
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
          <ChartTooltip
            contentStyle={{ backgroundColor: "hsl(var(--background))" }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
          />
          {subGroupKeys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              fill={`hsl(var(--chart-${(index % 4) + 1}))`}
              name={key}
              radius={[0, 4, 4, 0]}
            />
          ))}
        </BarChart>
      );
    } else {
      // Single-dimension rendering (backward compatibility)
      return (
        <BarChart
          data={processedData}
          layout="vertical"
          accessibilityLayer={accessibilityLayer}
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
            dataKey="name"
            stroke="hsl(var(--chart-grid))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatAxisLabel}
            width={90}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            fill="hsl(var(--chart-1))"
          />
          <ChartTooltip
            contentStyle={{ backgroundColor: "hsl(var(--background))" }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
          />
        </BarChart>
      );
    }
  };

  return <ChartContainer config={config}>{renderChart()}</ChartContainer>;
};

export default HorizontalBarChart;
