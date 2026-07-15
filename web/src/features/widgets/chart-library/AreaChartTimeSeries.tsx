import React, { useMemo, useRef, useState } from "react";
import {
  ChartActiveReferenceLine,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartTooltipPortal,
} from "@/src/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  getUniqueDimensions,
  groupDataByTimeDimension,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import { isolatedPointDot } from "@/src/features/widgets/chart-library/IsolatedPointDot";
import { useChartTickBudget } from "@/src/features/widgets/chart-library/useChartTickBudget";
import {
  prepareDenseSeries,
  prepareIsolatedPoints,
} from "@/src/features/widgets/chart-library/prepareDenseSeries";
import { prepareTimeAxis } from "@/src/features/widgets/chart-library/prepareTimeAxis";
import { prepareVisibleSeries } from "@/src/features/widgets/chart-library/prepareVisibleSeries";
import {
  seriesColor,
  SeriesOverflowNote,
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
  legendPosition = "auto",
  legendSummary = "none",
  legendInteraction = "highlight",
  maxVisibleSeries,
  syncId,
  subtleFill = false,
  missingValue = "gap",
  connectNulls = false,
  hideXAxisLabels = false,
}) => {
  const [selfHovered, setSelfHovered] = useState(false);
  const allDimensions = useMemo(() => getUniqueDimensions(data), [data]);
  // Make every (bucket, series) cell explicit — 0 for additive metrics, null
  // (a real gap) otherwise — so areas never draw across no-data buckets. (LFE-10694)
  const groupedData = useMemo(
    () =>
      prepareDenseSeries(
        groupDataByTimeDimension(data),
        allDimensions,
        missingValue,
      ),
    [data, allDimensions, missingValue],
  );
  // A real value with gaps on both sides spans no area segment — mark it with
  // a dot so honest gaps never hide real data. (LFE-10694)
  const isolatedPoints = useMemo(
    () => prepareIsolatedPoints(groupedData, allDimensions),
    [groupedData, allDimensions],
  );
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
        { hideCategoryTickLabels: hideXAxisLabels },
      ),
    [groupedData, maxTicks, hideXAxisLabels],
  );

  const { legendItems, onLegendClick, isRendered, isDimmed } = useSeriesLegend({
    data,
    dimensions,
    config,
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
      <SeriesOverflowNote
        visibleCount={dimensions.length}
        totalCount={series.total}
      />
      <ChartContainer
        ref={chartBoxRef}
        config={config}
        className="min-h-0 flex-1"
      >
        <AreaChart
          accessibilityLayer={accessibilityLayer}
          data={groupedData}
          syncId={syncId}
          syncMethod="value"
        >
          {/* syncWithTicks: grid lines sit exactly on the budget-thinned axis
              ticks (a line per shown day/hour), instead of recharts' default
              every-bucket grid — density follows the tick budget. (LFE-10576) */}
          <CartesianGrid
            stroke="hsl(var(--chart-grid))"
            vertical={timeAxis.showVerticalGrid}
            syncWithTicks
          />
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
            tickFormatter={(value) => tooltipFormatter(Number(value))}
          />
          {dimensions.map((dimension, index) => {
            if (!isRendered(dimension)) return null;
            const muted = isDimmed(dimension);
            const isolated = isolatedPoints.get(dimension);
            return (
              <Area
                key={dimension}
                type="linear"
                dataKey={dimension}
                // Neighborless points span no area segment; a dot is the only
                // thing that keeps them visible. (LFE-10694)
                dot={
                  isolated
                    ? isolatedPointDot(isolated, seriesColor(index), muted)
                    : false
                }
                stroke={seriesColor(index)}
                fill={seriesColor(index)}
                fillOpacity={muted ? 0.15 : subtleFill ? 0.3 : 0.75}
                strokeWidth={2.5}
                strokeOpacity={muted ? 0.2 : 1}
                connectNulls={connectNulls}
                isAnimationActive={false}
              />
            );
          })}
          <ChartActiveReferenceLine />
          <ChartTooltip
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
                    indicator="line"
                    labelFormatter={(value) => timeAxis.formatTooltip(value)}
                    valueFormatter={tooltipFormatter}
                    sortPayloadByValue="desc"
                  />
                </ChartTooltipPortal>
              ) : null
            }
          />
        </AreaChart>
      </ChartContainer>
      {(legendPosition === "below" ||
        (legendPosition === "auto" && legendItems.length > 1)) && (
        <TimeSeriesLegend
          items={legendItems}
          interaction={legendInteraction}
          onItemClick={onLegendClick}
          formatSummary={tooltipFormatter}
        />
      )}
    </div>
  );
};

export default AreaChartTimeSeries;
