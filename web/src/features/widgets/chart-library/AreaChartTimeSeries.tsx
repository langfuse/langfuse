import React, { useMemo, useState } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  getUniqueDimensions,
  groupDataByTimeDimension,
} from "@/src/features/widgets/chart-library/utils";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";

export const AreaChartTimeSeries: React.FC<ChartProps> = ({
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
  subtleFill = false,
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
    <div className="flex h-full w-full min-w-0 flex-col">
      {legendPosition === "above" && dimensions.length > 0 && (
        <div className="min-w-0 shrink-0 overflow-x-auto overflow-y-hidden pb-3">
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
        <AreaChart accessibilityLayer={accessibilityLayer} data={groupedData}>
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
              <Area
                key={dimension}
                type="monotone"
                dataKey={dimension}
                stroke={`hsl(var(--chart-${(index % 8) + 1}))`}
                fill={`hsl(var(--chart-${(index % 8) + 1}))`}
                fillOpacity={isMuted ? 0.15 : subtleFill ? 0.3 : 0.75}
                strokeWidth={2.5}
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
        </AreaChart>
      </ChartContainer>
    </div>
  );
};

export default AreaChartTimeSeries;
