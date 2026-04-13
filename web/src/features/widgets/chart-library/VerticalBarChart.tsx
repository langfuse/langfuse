import React, { useMemo } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import { compactNumberFormatter } from "@/src/utils/numbers";

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
  valueFormatter = compactNumberFormatter,
  subtleFill = false,
  metricLabel,
  categoryAxisLabel,
}) => {
  const effectiveConfig = useMemo(
    () =>
      metricLabel
        ? { ...config, metric: { ...config.metric, label: metricLabel } }
        : config,
    [config, metricLabel],
  );

  return (
    <ChartContainer
      config={effectiveConfig}
      className="[&_.recharts-bar-rectangle:hover]:opacity-30 dark:[&_.recharts-bar-rectangle:hover]:opacity-100 dark:[&_.recharts-bar-rectangle:hover]:brightness-[3]"
    >
      <BarChart
        accessibilityLayer={accessibilityLayer}
        data={data}
        margin={{
          bottom: categoryAxisLabel ? 20 : 0,
        }}
      >
        <XAxis
          type="category"
          dataKey="dimension"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          niceTicks="auto"
          label={
            categoryAxisLabel
              ? {
                  value: categoryAxisLabel,
                  position: "insideBottom",
                  offset: -12,
                  style: {
                    textAnchor: "middle",
                    fontSize: 11,
                    fill: "hsl(var(--muted-foreground))",
                  },
                }
              : undefined
          }
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
          className="fill-(--color-metric)"
          fillOpacity={subtleFill ? 0.3 : 1}
        />
        <ChartTooltip
          cursor={false}
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          content={({ active, payload, label }) => (
            <ChartTooltipContent
              active={active}
              payload={payload}
              label={label}
              valueFormatter={(v) => valueFormatter(Number(v))}
            />
          )}
        />
      </BarChart>
    </ChartContainer>
  );
};

export default VerticalBarChart;
