import React, { useMemo } from "react";
import { ChartContainer, ChartTooltip } from "@/src/components/ui/chart";
import { Label, Pie, PieChart as PieChartComponent } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  getDimensionCount,
  enrichDataWithDimensions,
} from "@/src/features/widgets/utils/dimension-utils";
import { processNestedDonutData } from "@/src/features/widgets/chart-library/utils";

/**
 * Enhanced PieChart component with multi-dimensional nested donut support
 *
 * Auto-detects dimension count and renders appropriately:
 * - Single dimension: Traditional pie chart with center label
 * - Multi-dimensional: Nested donuts (inner ring for first dimension, outer ring for combinations)
 *
 * @param data - Data to be displayed. Expects DataPoint[] with dimensions array
 * @param config - Configuration object for the chart. Can include theme settings for light and dark modes.
 * @param accessibilityLayer - Boolean to enable or disable the accessibility layer. Default is true.
 */
export const PieChart: React.FC<ChartProps> = ({
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
  // Auto-detect dimension count
  const dimensionCount = useMemo(() => getDimensionCount(data), [data]);

  // Calculate total metric value for center label
  const totalValue = useMemo(() => {
    return data.reduce((acc, curr) => acc + (curr.metric as number), 0);
  }, [data]);

  // Process data based on dimension count
  const processedData = useMemo(() => {
    if (dimensionCount > 1) {
      // Multi-dimensional: create nested donut data
      const enrichedData = enrichDataWithDimensions(data);
      return processNestedDonutData(enrichedData);
    } else {
      // Single dimension: traditional pie chart data
      return {
        outerRingData: data.map((item, index) => ({
          name: item.dimensions?.[0] || "Unknown",
          value: item.metric as number,
          fill: `hsl(var(--chart-${(index % 4) + 1}))`,
        })),
        innerRingData: [],
      };
    }
  }, [data, dimensionCount]);

  const renderChart = () => {
    if (dimensionCount > 1) {
      // Multi-dimensional nested donuts
      return (
        <PieChartComponent accessibilityLayer={accessibilityLayer}>
          <ChartTooltip
            contentStyle={{ backgroundColor: "hsl(var(--background))" }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
          />
          {/* Inner ring - First dimension */}
          <Pie
            data={processedData.innerRingData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={30}
            outerRadius={60}
            paddingAngle={2}
            strokeWidth={2}
          >
            {/* Center label for nested donuts */}
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-foreground text-2xl font-bold"
                      >
                        {totalValue.toLocaleString()}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 20}
                        className="fill-muted-foreground text-sm"
                      >
                        Total
                      </tspan>
                    </text>
                  );
                }
                return null;
              }}
            />
          </Pie>
          {/* Outer ring - Combined dimensions */}
          <Pie
            data={processedData.outerRingData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={95}
            paddingAngle={1}
            strokeWidth={2}
          />
        </PieChartComponent>
      );
    } else {
      // Single-dimension traditional pie chart
      return (
        <PieChartComponent accessibilityLayer={accessibilityLayer}>
          <ChartTooltip
            contentStyle={{ backgroundColor: "hsl(var(--background))" }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Pie
            data={processedData.outerRingData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={80}
            outerRadius={120}
            paddingAngle={2}
            strokeWidth={5}
          >
            {/* Center label for single-dimension donut */}
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-foreground text-3xl font-bold"
                      >
                        {totalValue.toLocaleString()}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 24}
                        className="fill-muted-foreground"
                      >
                        Total
                      </tspan>
                    </text>
                  );
                }
                return null;
              }}
            />
          </Pie>
        </PieChartComponent>
      );
    }
  };

  return <ChartContainer config={config}>{renderChart()}</ChartContainer>;
};

export default PieChart;
