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
import { cn } from "@/src/utils/tailwind";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
];

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
}) => {
  const [highlightedDimension, setHighlightedDimension] = useState<
    string | null
  >(null);

  const groupedData = useMemo(() => groupDataByTimeDimension(data), [data]);
  const dimensions = useMemo(() => getUniqueDimensions(data), [data]);

  const tooltipFormatter =
    valueFormatter ?? ((v: number) => Intl.NumberFormat("en-US").format(v));

  const handleLegendClick = (dimension: string) => {
    setHighlightedDimension((prev) => (prev === dimension ? null : dimension));
  };

  return (
    <div className="flex h-full w-full flex-col">
      {legendPosition === "above" && dimensions.length > 0 && (
        <div className="flex shrink-0 flex-nowrap justify-end overflow-x-auto pb-3">
          <div className="flex items-center gap-4">
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
                      backgroundColor:
                        CHART_COLORS[index % CHART_COLORS.length],
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
                dot={!isMuted ? { r: 4 } : false}
                activeDot={isMuted ? false : { r: 5, strokeWidth: 0 }}
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                strokeOpacity={isMuted ? 0.2 : 1}
                connectNulls
              />
            );
          })}
          <ChartTooltip
            contentStyle={{ backgroundColor: "hsl(var(--background))" }}
            content={(props) => (
              <ChartTooltipContent
                active={props.active}
                payload={props.payload}
                label={props.label}
                formatter={(value, name) => [
                  tooltipFormatter(Number(value)),
                  name,
                ]}
              />
            )}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
};

export default LineChartTimeSeries;
