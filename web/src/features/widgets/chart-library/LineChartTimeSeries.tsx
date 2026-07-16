import React, { useMemo, useRef, useState } from "react";
import {
  ChartActiveReferenceLine,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartTooltipPortal,
} from "@/src/components/ui/chart";
import { isolatedPointDot } from "@/src/features/widgets/chart-library/IsolatedPointDot";
import { NearestSeriesProbe } from "@/src/features/widgets/chart-library/NearestSeriesProbe";
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartProps,
  type ChartThreshold,
} from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  getUniqueDimensions,
  groupDataByTimeDimension,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
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

/** computeMetricExtent returns the [min, max] of all numeric metric values across the data, for sizing the eq/neq band. */
const computeMetricExtent = (
  data: ChartProps["data"],
): { min: number; max: number } | null => {
  let min = Infinity;
  let max = -Infinity;
  for (const point of data) {
    const m = point.metric;
    if (typeof m === "number" && Number.isFinite(m)) {
      if (m < min) min = m;
      if (m > max) max = m;
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
};

/** ThresholdOverlay returns the ReferenceLine + (operator-derived) ReferenceArea recharts elements for a single ChartThreshold. */
const ThresholdOverlay = ({
  threshold,
  extent,
}: {
  threshold: ChartThreshold;
  extent: { min: number; max: number } | null;
}) => {
  const stroke = `var(--color-${threshold.color}-600)`;
  const fill = `var(--color-${threshold.color}-500)`;
  const elements: React.ReactNode[] = [];

  switch (threshold.operator) {
    case "GT":
    case "GTE":
      elements.push(
        <ReferenceArea
          key={`area-${threshold.value}`}
          y2={threshold.value}
          ifOverflow="extendDomain"
          fill={fill}
          fillOpacity={0.14}
          stroke="none"
        />,
      );
      break;
    case "LT":
    case "LTE":
      elements.push(
        <ReferenceArea
          key={`area-${threshold.value}`}
          y1={threshold.value}
          ifOverflow="extendDomain"
          fill={fill}
          fillOpacity={0.14}
          stroke="none"
        />,
      );
      break;
    case "EQ":
    case "NEQ": {
      // Floor at 1 so threshold.value === 0 with no extent doesn't collapse
      // the band to a zero-height area (which Recharts then tiles across the
      // full chart).
      const bandEpsilon = Math.max(
        extent && extent.max > extent.min
          ? (extent.max - extent.min) * 0.01
          : Math.abs(threshold.value) * 0.01,
        1,
      );
      if (threshold.operator === "EQ") {
        // The violation IS the band: a thin shaded region centered on value.
        elements.push(
          <ReferenceArea
            key={`area-${threshold.value}`}
            y1={threshold.value - bandEpsilon}
            y2={threshold.value + bandEpsilon}
            ifOverflow="extendDomain"
            fill={fill}
            fillOpacity={0.14}
            stroke="none"
          />,
        );
      } else {
        elements.push(
          <ReferenceArea
            key={`area-above-${threshold.value}`}
            y2={threshold.value + bandEpsilon}
            ifOverflow="extendDomain"
            fill={fill}
            fillOpacity={0.14}
            stroke="none"
          />,
          <ReferenceArea
            key={`area-below-${threshold.value}`}
            y1={threshold.value - bandEpsilon}
            ifOverflow="extendDomain"
            fill={fill}
            fillOpacity={0.14}
            stroke="none"
          />,
        );
      }
      break;
    }
  }

  // Inclusive operators get solid lines, exclusive operators get dashed lines
  const isInclusive =
    threshold.operator === "GTE" ||
    threshold.operator === "LTE" ||
    threshold.operator === "EQ";

  elements.push(
    <ReferenceLine
      key={`line-${threshold.value}`}
      y={threshold.value}
      stroke={stroke}
      strokeWidth={1.5}
      strokeDasharray={isInclusive ? undefined : "4 4"}
      ifOverflow="extendDomain"
    >
      {threshold.label && (
        <Label
          value={threshold.label}
          position="insideTopRight"
          fill={stroke}
          fontSize={11}
        />
      )}
    </ReferenceLine>,
  );

  return <>{elements}</>;
};

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
  metricFormatter = (value, options) => formatMetric(value, options),
  legendPosition = "auto",
  legendSummary = "none",
  legendInteraction = "highlight",
  maxVisibleSeries,
  syncId,
  // Lines draw clean by default — a dot per sample is chart-junk on anything
  // but a handful of points. The hovered point still gets a dot (activeDot),
  // so the value is readable on hover without littering the line. (LFE-10549, V7)
  showDataPointDots = false,
  thresholds,
  missingValue = "gap",
  connectNulls = false,
  hideXAxisLabels = false,
}) => {
  const metricExtent = useMemo(() => computeMetricExtent(data), [data]);

  const allDimensions = useMemo(() => getUniqueDimensions(data), [data]);
  // Make every (bucket, series) cell explicit — 0 for additive metrics, null
  // (a real gap) otherwise — so lines never draw across no-data buckets. (LFE-10694)
  const groupedData = useMemo(
    () =>
      prepareDenseSeries(
        groupDataByTimeDimension(data),
        allDimensions,
        missingValue,
      ),
    [data, allDimensions, missingValue],
  );
  // A real value with gaps on both sides spans no line segment — mark it with
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

  const {
    legendItems,
    onLegendClick,
    isRendered,
    isDimmed,
    isHighlightActive,
  } = useSeriesLegend({
    data,
    dimensions,
    config,
    legendSummary,
    legendInteraction,
    maxVisibleSeries,
  });

  const renderedDimensions = dimensions.filter(isRendered);

  // Hover proximity: the line the cursor is vertically nearest to is emphasized
  // and the rest dimmed; cleared when the cursor isn't on a line (then everything
  // renders normally). Disabled while a series is click-focused, and gated on
  // self-hover so a synced sibling chart doesn't react to a cursor over another.
  const [selfHovered, setSelfHovered] = useState(false);
  const [nearestDimensions, setNearestDimensions] = useState<string[]>([]);
  const nearestSet = useMemo(
    () => new Set(nearestDimensions),
    [nearestDimensions],
  );
  const proximityActive = !isHighlightActive && nearestSet.size > 0;

  const tooltipFormatter = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

  return (
    <div
      ref={containerRef}
      className="flex size-full min-w-0 flex-col"
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
        <LineChart
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
            width="auto"
            niceTicks="auto"
            tickFormatter={(value) => tooltipFormatter(Number(value))}
          />
          {dimensions.map((dimension, index) => {
            if (!isRendered(dimension)) return null;
            const nearest = proximityActive && nearestSet.has(dimension);
            const muted = isDimmed(dimension) || (proximityActive && !nearest);
            const isolated = isolatedPoints.get(dimension);
            return (
              <Line
                key={dimension}
                type="linear"
                dataKey={dimension}
                strokeWidth={nearest ? 3.5 : 2.5}
                dot={
                  showDataPointDots && !muted
                    ? { r: 4 }
                    : // Neighborless points span no line segment; a dot is the
                      // only thing that keeps them visible. (LFE-10694)
                      isolated
                      ? isolatedPointDot(isolated, seriesColor(index), muted)
                      : false
                }
                // The hover marker is independent of the static-dot setting: even
                // a dotless line reveals the point under the cursor.
                activeDot={muted ? false : { r: 5, strokeWidth: 0 }}
                stroke={seriesColor(index)}
                strokeOpacity={muted ? 0.2 : 1}
                connectNulls={connectNulls}
                isAnimationActive={false}
              />
            );
          })}
          {thresholds?.map((threshold, i) => (
            <ThresholdOverlay
              key={`threshold-${i}-${threshold.value}`}
              threshold={threshold}
              extent={metricExtent}
            />
          ))}
          <ChartActiveReferenceLine />
          <ChartTooltip
            content={({ active, payload, label, coordinate }) =>
              // Synced sibling charts share the crosshair (above) but the
              // tooltip belongs only to the chart under the cursor; it portals
              // into the overlay layer so the chart frame never clips it. (LFE-10549)
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
                    highlightedKeys={proximityActive ? nearestSet : undefined}
                  />
                </ChartTooltipPortal>
              ) : null
            }
          />
          <NearestSeriesProbe
            // Only the lines actually drawn are candidates — otherwise a hidden
            // (toggled-off) series whose data still sits in groupedData could be
            // picked as "nearest" and mute every visible line. (LFE-10549)
            dimensions={renderedDimensions}
            enabled={selfHovered && !isHighlightActive}
            onNearestChange={setNearestDimensions}
          />
        </LineChart>
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

export default LineChartTimeSeries;
