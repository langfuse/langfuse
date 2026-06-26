import React, { useMemo, useState } from "react";
import {
  ChartActiveReferenceLine,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  getUniqueDimensions,
  groupDataByTimeDimension,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import { cn } from "@/src/utils/tailwind";

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
  metricFormatter = (value, options) => formatMetric(value, options),
  legendPosition = "none",
  subtleFill = false,
}) => {
  const groupedData = useMemo(() => groupDataByTimeDimension(data), [data]);
  const dimensions = useMemo(() => getUniqueDimensions(data), [data]);
  const [highlightedDimension, setHighlightedDimension] = useState<
    string | null
  >(null);
  // Ignore a highlight that no longer matches a rendered series (breakdown
  // switched, Ask-AI applied a new spec, a filter dropped the value) — otherwise
  // every bar reads as muted and the chart renders ghosted until the next click.
  const effectiveHighlight =
    highlightedDimension && dimensions.includes(highlightedDimension)
      ? highlightedDimension
      : null;
  const formatValue = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

  const handleLegendClick = (dimension: string) => {
    setHighlightedDimension((prev) => {
      const current = prev && dimensions.includes(prev) ? prev : null;
      return current === dimension ? null : dimension;
    });
  };

  return (
    <div className="flex size-full min-w-0 flex-col">
      {legendPosition === "above" && dimensions.length > 0 && (
        <div className="min-w-0 shrink-0 overflow-x-auto pb-3">
          <div className="flex w-max min-w-full flex-nowrap justify-end gap-4">
            {dimensions.map((dimension, index) => {
              const isActive = effectiveHighlight === dimension;
              const isMuted = effectiveHighlight !== null && !isActive;
              return (
                <button
                  key={dimension}
                  type="button"
                  onClick={() => handleLegendClick(dimension)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap transition-opacity",
                    "cursor-pointer hover:opacity-80",
                    isMuted && "opacity-40",
                  )}
                  aria-pressed={isActive}
                  aria-label={
                    isActive ? "Show all series" : `Show only ${dimension}`
                  }
                >
                  <div
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{
                      backgroundColor: `hsl(var(--chart-${(index % 8) + 1}))`,
                    }}
                  />
                  <span className="text-muted-foreground">{dimension}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <ChartContainer
        config={config}
        className="min-h-0 flex-1 [&_.recharts-bar-rectangle:hover]:opacity-30 dark:[&_.recharts-bar-rectangle:hover]:opacity-100 dark:[&_.recharts-bar-rectangle:hover]:brightness-[3]"
      >
        <BarChart accessibilityLayer={accessibilityLayer} data={groupedData}>
          <XAxis
            dataKey="time_dimension"
            stroke="hsl(var(--chart-grid))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            type="number"
            stroke="hsl(var(--chart-grid))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            niceTicks="auto"
            tickFormatter={(value) => formatValue(Number(value))}
          />
          {dimensions.map((dimension, index) => {
            const isMuted =
              effectiveHighlight !== null && effectiveHighlight !== dimension;
            return (
              <Bar
                key={dimension}
                dataKey={dimension}
                stroke={`hsl(var(--chart-${(index % 8) + 1}))`}
                fill={`hsl(var(--chart-${(index % 8) + 1}))`}
                fillOpacity={isMuted ? 0.2 : subtleFill ? 0.3 : 1}
                stackId={dimensions.length > 1 ? "stack" : undefined}
                isAnimationActive={false}
              />
            );
          })}
          <ChartActiveReferenceLine />
          <ChartTooltip
            cursor={false}
            contentStyle={{ backgroundColor: "hsl(var(--background))" }}
            content={({ active, payload, label }) => (
              <ChartTooltipContent
                active={active}
                payload={payload}
                label={label}
                valueFormatter={formatValue}
                sortPayloadByValue="desc"
              />
            )}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
};

export default VerticalBarChartTimeSeries;
