import React, { useMemo, useState } from "react";
import {
  ChartActiveReferenceLine,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
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
import { cn } from "@/src/utils/tailwind";

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
    case "NEQ":
      const bandEpsilon =
        extent && extent.max > extent.min
          ? (extent.max - extent.min) * 0.01
          : Math.abs(threshold.value) * 0.01;
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
      break;
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
  showDataPointDots = true,
  thresholds,
}) => {
  const metricExtent = useMemo(() => computeMetricExtent(data), [data]);
  const [highlightedDimension, setHighlightedDimension] = useState<
    string | null
  >(null);

  const groupedData = useMemo(() => groupDataByTimeDimension(data), [data]);
  const dimensions = useMemo(() => getUniqueDimensions(data), [data]);

  const tooltipFormatter = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

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
                    "flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap transition-opacity",
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
            interval="preserveStartEnd"
            minTickGap={24}
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
          {thresholds?.map((threshold, i) => (
            <ThresholdOverlay
              key={`threshold-${i}-${threshold.value}`}
              threshold={threshold}
              extent={metricExtent}
            />
          ))}
          <ChartActiveReferenceLine />
          <ChartTooltip
            contentStyle={{ backgroundColor: "hsl(var(--background))" }}
            content={({ active, payload, label }) => (
              <ChartTooltipContent
                active={active}
                payload={payload}
                label={label}
                indicator="line"
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
