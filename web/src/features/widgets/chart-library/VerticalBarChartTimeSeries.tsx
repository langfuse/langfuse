import React, { useMemo } from "react";
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
  getEvenTickInterval,
  getUniqueDimensions,
  groupDataByTimeDimension,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import {
  seriesColor,
  TimeSeriesLegend,
  useSeriesLegend,
} from "@/src/features/widgets/chart-library/TimeSeriesLegend";

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
  legendSummary = "none",
  legendInteraction = "highlight",
  maxVisibleSeries,
  syncId,
  subtleFill = false,
}) => {
  const groupedData = useMemo(() => groupDataByTimeDimension(data), [data]);
  const dimensions = useMemo(() => getUniqueDimensions(data), [data]);
  const xTickInterval = getEvenTickInterval(groupedData.length);

  const { legendItems, onLegendClick, isRendered, isDimmed } = useSeriesLegend({
    data,
    dimensions,
    legendSummary,
    legendInteraction,
    maxVisibleSeries,
  });

  const formatValue = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

  const renderedDimensions = dimensions.filter(isRendered);

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {legendPosition === "above" && (
        <TimeSeriesLegend
          items={legendItems}
          interaction={legendInteraction}
          onItemClick={onLegendClick}
          formatSummary={formatValue}
        />
      )}
      <ChartContainer
        config={config}
        className="min-h-0 flex-1 [&_.recharts-bar-rectangle:hover]:opacity-30 dark:[&_.recharts-bar-rectangle:hover]:opacity-100 dark:[&_.recharts-bar-rectangle:hover]:brightness-[3]"
      >
        <BarChart
          accessibilityLayer={accessibilityLayer}
          data={groupedData}
          syncId={syncId}
        >
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
            tickFormatter={(value) => formatValue(Number(value))}
          />
          {dimensions.map((dimension, index) => {
            if (!isRendered(dimension)) return null;
            const muted = isDimmed(dimension);
            return (
              <Bar
                key={dimension}
                dataKey={dimension}
                stroke={seriesColor(index)}
                strokeOpacity={muted ? 0.2 : 1}
                fill={seriesColor(index)}
                fillOpacity={muted ? 0.2 : subtleFill ? 0.3 : 1}
                stackId={renderedDimensions.length > 1 ? "stack" : undefined}
                isAnimationActive={false}
              />
            );
          })}
          <ChartActiveReferenceLine />
          <ChartTooltip
            allowEscapeViewBox={{ x: true, y: true }}
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
