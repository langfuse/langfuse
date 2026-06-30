import React, { useCallback } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  getDrilldownFromPayload,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";

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
  metricFormatter = (value, options) => formatMetric(value, options),
  subtleFill = false,
  onDrilldown,
}) => {
  const formatValue = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

  const hasDrilldowns = Boolean(
    onDrilldown && data.some((point) => point.drilldown),
  );

  const handleBarClick = useCallback(
    (payload: unknown) => {
      const drilldown = getDrilldownFromPayload(payload);
      if (drilldown) onDrilldown?.(drilldown.href);
    },
    [onDrilldown],
  );

  return (
    <ChartContainer
      config={config}
      className={`[&_.recharts-bar-rectangle:hover]:opacity-30 dark:[&_.recharts-bar-rectangle:hover]:opacity-100 dark:[&_.recharts-bar-rectangle:hover]:brightness-[3] ${hasDrilldowns ? "[&_.recharts-bar-rectangle]:cursor-pointer" : ""}`}
    >
      <BarChart accessibilityLayer={accessibilityLayer} data={data}>
        <XAxis
          type="category"
          dataKey="dimension"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          niceTicks="auto"
        />
        <YAxis
          type="number"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatValue(Number(value))}
        />
        <Bar
          dataKey="metric"
          radius={[4, 4, 0, 0]}
          className="fill-(--color-metric)"
          fillOpacity={subtleFill ? 0.3 : 1}
          isAnimationActive={false}
          onClick={handleBarClick}
        />
        <ChartTooltip
          cursor={false}
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          content={({ active, payload, label }) => (
            <ChartTooltipContent
              active={active}
              payload={payload}
              label={label}
              valueFormatter={(v) => formatValue(Number(v))}
            />
          )}
        />
      </BarChart>
    </ChartContainer>
  );
};

export default VerticalBarChart;
