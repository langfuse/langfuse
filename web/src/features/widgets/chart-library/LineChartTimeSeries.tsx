import React, { useMemo, useState } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  getUniqueDimensions,
  groupDataByTimeDimension,
} from "@/src/features/widgets/chart-library/utils";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";

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
  valueFormatter,
  legendPosition = "none",
  showDataPointDots = true,
}) => {
  const [highlightedDimension, setHighlightedDimension] = useState<
    string | null
  >(null);

  const groupedData = useMemo(() => groupDataByTimeDimension(data), [data]);
  const dimensions = useMemo(() => getUniqueDimensions(data), [data]);

  const tooltipFormatter = valueFormatter ?? compactNumberFormatter;

  const handleLegendClick = (dimension: string) => {
    setHighlightedDimension((prev) => (prev === dimension ? null : dimension));
  };

  return (
    <div className="flex size-full min-w-0 flex-col">
      {legendPosition === "above" && dimensions.length > 0 && (
        <div className="min-w-0 shrink-0 overflow-x-auto pb-3">
          <div className="flex w-max min-w-full flex-nowrap justify-end gap-4">
            {dimensions.map((dimension, index) => {
              const isHighlighted =
                highlightedDimension === null ||
                highlightedDimension === dimension;
              const isMuted = highlightedDimension !== null && !isHighlighted;
              return (
                <button
                  key={dimension}
                  type="button"
                  onClick={() => handleLegendClick(dimension)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs transition-opacity",
                    "cursor-pointer hover:opacity-80",
                    isMuted && "opacity-40",
                  )}
                  aria-pressed={isHighlighted}
                  aria-label={
                    isHighlighted ? `Show only ${dimension}` : "Show all series"
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
      <ChartContainer config={config} className="min-h-0 flex-1">
        <LineChart accessibilityLayer={accessibilityLayer} data={groupedData}>
          <CartesianGrid stroke="hsl(var(--chart-grid))" vertical={false} />
          <XAxis
            dataKey="time_dimension"
            stroke="hsl(var(--chart-grid))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="number"
            stroke="hsl(var(--chart-grid))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => tooltipFormatter(Number(value))}
          />
          {dimensions.map((dimension, index) => {
            const isMuted =
              highlightedDimension !== null &&
              highlightedDimension !== dimension;
            return (
              <Line
                key={dimension}
                type="monotone"
                dataKey={dimension}
                strokeWidth={2.5}
                dot={showDataPointDots && !isMuted ? { r: 4 } : false}
                activeDot={
                  showDataPointDots && !isMuted
                    ? { r: 5, strokeWidth: 0 }
                    : false
                }
                stroke={`hsl(var(--chart-${(index % 8) + 1}))`}
                strokeOpacity={isMuted ? 0.2 : 1}
                connectNulls
              />
            );
          })}
          <ChartTooltip
            contentStyle={{ backgroundColor: "hsl(var(--background))" }}
            content={({ active, payload, label }) => (
              <ChartTooltipContent
                active={active}
                payload={payload}
                label={label}
                valueFormatter={tooltipFormatter}
                sortPayloadByValue="desc"
              />
            )}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
};

export default LineChartTimeSeries;
