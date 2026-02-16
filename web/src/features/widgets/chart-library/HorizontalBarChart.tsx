import React from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import { formatAxisLabel } from "@/src/features/widgets/chart-library/utils";
import { compactNumberFormatter } from "@/src/utils/numbers";
/**
 * HorizontalBarChart component
 * @param data - Data to be displayed. Expects an array of objects with dimension and metric properties.
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
  showValueLabels = false,
  valueFormatter = compactNumberFormatter,
  subtleFill = false,
}) => {
  return (
    <ChartContainer config={config} className="min-h-0 w-full">
      <BarChart
        accessibilityLayer={accessibilityLayer}
        data={data}
        layout="vertical"
        margin={{
          top: 4,
          right: showValueLabels ? 68 : 8,
          bottom: 4,
          left: 0,
        }}
        barCategoryGap="12%"
        barGap={4}
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
          dataKey="dimension"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={120}
          tick={({ x, y, payload }) => {
            const fullLabel =
              typeof payload === "string"
                ? payload
                : ((payload as { value?: string })?.value ?? String(payload));
            return (
              <g transform={`translate(${x},${y})`}>
                <title>{fullLabel}</title>
                <text
                  textAnchor="end"
                  x={0}
                  y={0}
                  dy={4}
                  fill="hsl(var(--muted-foreground))"
                  fontSize={12}
                >
                  {formatAxisLabel(fullLabel)}
                </text>
              </g>
            );
          }}
        />
        <Bar
          dataKey="metric"
          radius={[0, 4, 4, 0]}
          maxBarSize={28}
          className="fill-[--color-metric]"
          fillOpacity={subtleFill ? 0.3 : 1}
        >
          {showValueLabels ? (
            <LabelList
              dataKey="metric"
              position="right"
              formatter={(value: number) => valueFormatter(value)}
              className="fill-muted-foreground"
              style={{ fontSize: 12 }}
            />
          ) : null}
        </Bar>
        <ChartTooltip
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

export default HorizontalBarChart;
