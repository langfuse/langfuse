import React, { useMemo, useState } from "react";
import {
  ChartActiveReferenceLine,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  getUniqueDimensions,
  groupDataByTimeDimension,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import { useResponsiveTickInterval } from "@/src/features/widgets/chart-library/useResponsiveTickInterval";
import {
  seriesColor,
  TimeSeriesLegend,
  useSeriesLegend,
} from "@/src/features/widgets/chart-library/TimeSeriesLegend";

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
  metricFormatter = (value, options) => formatMetric(value, options),
  legendPosition = "none",
  legendSummary = "none",
  legendInteraction = "highlight",
  maxVisibleSeries,
  syncId,
  subtleFill = false,
}) => {
  const [selfHovered, setSelfHovered] = useState(false);
  const groupedData = useMemo(() => groupDataByTimeDimension(data), [data]);
  const dimensions = useMemo(() => getUniqueDimensions(data), [data]);
  const { ref: containerRef, interval: xTickInterval } =
    useResponsiveTickInterval(groupedData.length);

  const { legendItems, onLegendClick, isRendered, isDimmed } = useSeriesLegend({
    data,
    dimensions,
    legendSummary,
    legendInteraction,
    maxVisibleSeries,
  });

  const tooltipFormatter = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full min-w-0 flex-col"
      onMouseEnter={() => setSelfHovered(true)}
      onMouseLeave={() => setSelfHovered(false)}
    >
      {legendPosition === "above" && (
        <TimeSeriesLegend
          items={legendItems}
          interaction={legendInteraction}
          onItemClick={onLegendClick}
          formatSummary={tooltipFormatter}
        />
      )}
      <ChartContainer config={config} className="min-h-0 flex-1">
        <AreaChart
          accessibilityLayer={accessibilityLayer}
          data={groupedData}
          syncId={syncId}
          syncMethod="value"
        >
          <CartesianGrid stroke="hsl(var(--chart-grid))" vertical={false} />
          <XAxis
            dataKey="time_dimension"
            stroke="hsl(var(--chart-grid))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            interval={xTickInterval}
          />
          <YAxis
            type="number"
            stroke="hsl(var(--chart-grid))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            niceTicks="auto"
            tickFormatter={(value) => tooltipFormatter(Number(value))}
          />
          {dimensions.map((dimension, index) => {
            if (!isRendered(dimension)) return null;
            const muted = isDimmed(dimension);
            return (
              <Area
                key={dimension}
                type="monotone"
                dataKey={dimension}
                stroke={seriesColor(index)}
                fill={seriesColor(index)}
                fillOpacity={muted ? 0.15 : subtleFill ? 0.3 : 0.75}
                strokeWidth={2.5}
                strokeOpacity={muted ? 0.2 : 1}
                connectNulls
                isAnimationActive={false}
              />
            );
          })}
          <ChartActiveReferenceLine />
          <ChartTooltip
            allowEscapeViewBox={{ x: true, y: true }}
            contentStyle={{ backgroundColor: "hsl(var(--background))" }}
            content={({ active, payload, label }) =>
              // Synced siblings show only the crosshair; the tooltip is the
              // hovered chart's. (LFE-10549)
              selfHovered ? (
                <ChartTooltipContent
                  active={active}
                  payload={payload}
                  label={label}
                  indicator="line"
                  valueFormatter={tooltipFormatter}
                  sortPayloadByValue="desc"
                />
              ) : null
            }
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
};

export default AreaChartTimeSeries;
