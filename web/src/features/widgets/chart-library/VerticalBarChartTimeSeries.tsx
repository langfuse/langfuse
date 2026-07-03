import React, { useMemo, useRef, useState } from "react";
import {
  ChartActiveReferenceLine,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartTooltipPortal,
} from "@/src/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  getUniqueDimensions,
  groupDataByTimeDimension,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import { useChartTickBudget } from "@/src/features/widgets/chart-library/useChartTickBudget";
import { prepareTimeAxis } from "@/src/features/widgets/chart-library/prepareTimeAxis";
import { prepareVisibleSeries } from "@/src/features/widgets/chart-library/prepareVisibleSeries";
import {
  seriesColor,
  SeriesOverflowNote,
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
  const [selfHovered, setSelfHovered] = useState(false);
  const groupedData = useMemo(() => groupDataByTimeDimension(data), [data]);
  const allDimensions = useMemo(() => getUniqueDimensions(data), [data]);
  // Cap how many series we draw (data -> preparer seam): a high-cardinality
  // breakdown of hundreds of series is both unreadable and slow to hover. (LFE-10549)
  const series = useMemo(
    () => prepareVisibleSeries(data, allDimensions),
    [data, allDimensions],
  );
  const dimensions = series.visible;
  const { ref: containerRef, maxTicks } = useChartTickBudget();
  const chartBoxRef = useRef<HTMLDivElement>(null);
  const timeAxis = useMemo(
    () =>
      prepareTimeAxis(
        groupedData.map((d) => d.time_dimension),
        maxTicks,
      ),
    [groupedData, maxTicks],
  );

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
    <div
      ref={containerRef}
      className="flex h-full w-full min-w-0 flex-col"
      // onMouseMove (not just onMouseEnter) so the tooltip un-gates even when the
      // cursor is already over the chart at mount/refresh (enter never fires). (LFE-10549)
      onMouseEnter={() => setSelfHovered(true)}
      onMouseMove={() => setSelfHovered(true)}
      onMouseLeave={() => setSelfHovered(false)}
      // Keyboard parity: recharts' accessibilityLayer lets Tab/arrow users move
      // the crosshair, but that fires no mouse event — un-gate the tooltip on
      // focus too, and re-gate only when focus leaves the chart. (LFE-10549)
      onFocus={() => setSelfHovered(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setSelfHovered(false);
      }}
    >
      {legendPosition === "above" && (
        <TimeSeriesLegend
          items={legendItems}
          interaction={legendInteraction}
          onItemClick={onLegendClick}
          formatSummary={formatValue}
        />
      )}
      <SeriesOverflowNote
        visibleCount={dimensions.length}
        totalCount={series.total}
      />
      <ChartContainer
        ref={chartBoxRef}
        config={config}
        className="min-h-0 flex-1 [&_.recharts-bar-rectangle:hover]:opacity-30 dark:[&_.recharts-bar-rectangle:hover]:opacity-100 dark:[&_.recharts-bar-rectangle:hover]:brightness-[3]"
      >
        <BarChart
          accessibilityLayer={accessibilityLayer}
          data={groupedData}
          syncId={syncId}
          syncMethod="value"
        >
          <XAxis
            dataKey="time_dimension"
            stroke="hsl(var(--chart-grid))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            interval={timeAxis.interval}
            tickFormatter={timeAxis.formatTick}
            {...timeAxis.tickProps}
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
            cursor={false}
            content={({ active, payload, label, coordinate }) =>
              // Synced siblings show only the crosshair; the tooltip is the
              // hovered chart's, portaled out of the chart frame. (LFE-10549)
              selfHovered ? (
                <ChartTooltipPortal
                  active={active}
                  coordinate={coordinate}
                  anchorRef={chartBoxRef}
                >
                  <ChartTooltipContent
                    active={active}
                    payload={payload}
                    label={label}
                    labelFormatter={(value) => timeAxis.formatTooltip(value)}
                    valueFormatter={formatValue}
                    sortPayloadByValue="desc"
                  />
                </ChartTooltipPortal>
              ) : null
            }
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
};

export default VerticalBarChartTimeSeries;
