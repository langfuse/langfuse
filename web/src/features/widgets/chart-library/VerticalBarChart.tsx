import React, { useMemo } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import {
  Bar,
  BarChart,
  type BarShapeProps,
  Rectangle,
  XAxis,
  YAxis,
} from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import { prepareSeriesColors } from "@/src/features/widgets/chart-library/prepareSeriesColors";
import {
  formatMetric,
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
  semanticContext,
}) => {
  const formatValue = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

  // All-or-nothing per-category coloring — see HorizontalBarChart. (LFE-15467)
  const seriesColors = useMemo(() => {
    const names = data.map((item) => item.dimension || "Unknown");
    return { names, ...prepareSeriesColors(names, semanticContext) };
  }, [data, semanticContext]);

  return (
    <ChartContainer
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
          // The class fill would override the per-shape fill attribute (CSS
          // beats SVG presentation attributes), so it must be absent when the
          // bars color per category.
          className={
            seriesColors.hasStatusColor ? undefined : "fill-(--color-metric)"
          }
          fillOpacity={subtleFill ? 0.3 : 1}
          isAnimationActive={false}
          shape={
            seriesColors.hasStatusColor
              ? (props: BarShapeProps) => (
                  <Rectangle
                    {...props}
                    fill={seriesColors.colorOf(
                      String(props.payload?.dimension ?? "Unknown"),
                    )}
                  />
                )
              : undefined
          }
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
