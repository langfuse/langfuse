import React, { useMemo, useState } from "react";
import {
  ChartActiveReferenceLine,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
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
import { useResponsiveTickInterval } from "@/src/features/widgets/chart-library/useResponsiveTickInterval";
import {
  seriesColor,
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
  legendPosition = "none",
  legendSummary = "none",
  legendInteraction = "highlight",
  maxVisibleSeries,
  syncId,
  showDataPointDots = true,
  thresholds,
}) => {
  const metricExtent = useMemo(() => computeMetricExtent(data), [data]);

  const groupedData = useMemo(() => groupDataByTimeDimension(data), [data]);
  const dimensions = useMemo(() => getUniqueDimensions(data), [data]);
  const { ref: containerRef, interval: xTickInterval } =
    useResponsiveTickInterval(groupedData.length);

  const {
    legendItems,
    onLegendClick,
    isRendered,
    isDimmed,
    isHighlightActive,
  } = useSeriesLegend({
    data,
    dimensions,
    legendSummary,
    legendInteraction,
    maxVisibleSeries,
  });

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
        <LineChart
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
            width="auto"
            niceTicks="auto"
            tickFormatter={(value) => tooltipFormatter(Number(value))}
          />
          {dimensions.map((dimension, index) => {
            if (!isRendered(dimension)) return null;
            const nearest = proximityActive && nearestSet.has(dimension);
            const muted = isDimmed(dimension) || (proximityActive && !nearest);
            return (
              <Line
                key={dimension}
                type="monotone"
                dataKey={dimension}
                strokeWidth={nearest ? 3.5 : 2.5}
                dot={showDataPointDots && !muted ? { r: 4 } : false}
                activeDot={
                  showDataPointDots && !muted ? { r: 5, strokeWidth: 0 } : false
                }
                stroke={seriesColor(index)}
                strokeOpacity={muted ? 0.2 : 1}
                connectNulls
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
            allowEscapeViewBox={{ x: true, y: true }}
            contentStyle={{ backgroundColor: "hsl(var(--background))" }}
            content={({ active, payload, label }) =>
              // Synced sibling charts share the crosshair (above) but the
              // tooltip belongs only to the chart under the cursor. (LFE-10549)
              selfHovered ? (
                <ChartTooltipContent
                  active={active}
                  payload={payload}
                  label={label}
                  indicator="line"
                  valueFormatter={tooltipFormatter}
                  sortPayloadByValue="desc"
                  highlightedKeys={proximityActive ? nearestSet : undefined}
                />
              ) : null
            }
          />
          <NearestSeriesProbe
            dimensions={dimensions}
            enabled={selfHovered && !isHighlightActive}
            onNearestChange={setNearestDimensions}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
};

export default LineChartTimeSeries;
