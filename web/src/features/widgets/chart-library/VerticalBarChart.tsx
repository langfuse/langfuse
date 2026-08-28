import React from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import { useChartTickBudget } from "@/src/features/widgets/chart-library/useChartTickBudget";

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
  hideXAxisLabels = false,
}) => {
  const { ref: containerRef, maxYTicks } = useChartTickBudget();

  const formatValue = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

  return (
    <ChartContainer
      ref={containerRef}
      config={config}
      className="[&_.recharts-bar-rectangle:hover]:opacity-30 dark:[&_.recharts-bar-rectangle:hover]:opacity-100 dark:[&_.recharts-bar-rectangle:hover]:brightness-[3]"
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
          // Same treatment prepareTimeAxis gives a hidden categorical axis:
          // every tick drawn, label-less, on a slim axis. The category stays in
          // the tooltip. (LFE-15711)
          {...(hideXAxisLabels
            ? { interval: 0, tickFormatter: () => "", height: 8 }
            : {})}
        />
        <YAxis
          type="number"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          niceTicks="auto"
          // A bar encodes its value as a LENGTH, so the baseline has to be
          // zero: on a fitted domain three bars of 0.8/0.87/1.0 draw as
          // short/medium/full and read as a far bigger difference than there
          // is. `min(0, dataMin)` rather than a flat 0 so a negative series
          // (a delta) still fits. The max keeps `"auto"`, which is what lets
          // niceTicks round the top of the scale. (LFE-15711)
          domain={[(dataMin: number) => Math.min(0, dataMin), "auto"]}
          // Ask for only as many ticks as the measured height fits, so recharts
          // never has to drop colliding labels — and so the zero tick, the one
          // that says where a bar is measured from, survives in a short band.
          tickCount={maxYTicks}
          tickFormatter={(value) => formatValue(Number(value))}
        />
        <Bar
          dataKey="metric"
          radius={[4, 4, 0, 0]}
          className="fill-(--color-metric)"
          fillOpacity={subtleFill ? 0.3 : 1}
          isAnimationActive={false}
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
