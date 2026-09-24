"use client";

import { useId, useState } from "react";
import { scaleLinear } from "d3-scale";

import { ChartContainer } from "@/src/components/design-system/charts/ChartContainer";
import { INACTIVE_CHART_COLOR_STRENGTH } from "@/src/components/design-system/charts/constants";
import { CartesianChart } from "@/src/components/design-system/internal/charts/CartesianChart";
import { CartesianLayout } from "@/src/components/design-system/internal/charts/CartesianLayout";
import {
  ChartLegend,
  type ChartLegendItem,
} from "@/src/components/design-system/internal/charts/ChartLegend";
import { ChartTooltip } from "@/src/components/design-system/internal/charts/ChartTooltip";
import { createBarBandScale } from "@/src/components/design-system/internal/charts/fns/createBarBandScale";
import type { LineChartLegend } from "@/src/components/design-system/charts/LineChart/LineChart";

export type BarChartDatum = {
  label: string;
  value: number | null;
  color?: string;
};

export type SingleBarChartCoreProps = {
  layout: "single";
  data: BarChartDatum[];
  valueFormatter?: (value: number) => string;
  color?: string;
  variant?: "default" | "subtle";
  hideXAxisLabels?: boolean;
  zeroBaseline?: boolean;
  ariaLabel?: string;
  legend?: { items: ChartLegendItem[] };
  tooltipHeading?: (label: string) => string;
  tooltipValueLabel?: string;
  barSpacing: "default" | "histogram";
};

export type MultiSeriesBarChartCoreProps = {
  data: { key: string; values: Record<string, number | null> }[];
  series: { id: string; label: string; color: string }[];
  valueFormatter?: (value: number) => string;
  tickFormatter?: (value: string) => string;
  categoryXAxisLabels?: boolean;
  tooltipFormatter?: (value: string) => string;
  hideXAxisLabels?: boolean;
  sync?: {
    activeKey: string | undefined;
    onActiveKeyChange: (key: string | undefined) => void;
  };
  legend?: LineChartLegend;
  layout: "stacked" | "grouped";
};

export function BarChartCore(
  props: SingleBarChartCoreProps | MultiSeriesBarChartCoreProps,
) {
  if (props.layout === "single") {
    return <SingleBarChart {...props} />;
  }
  return <MultiSeriesBarChart {...props} />;
}

// Shared chart mechanics for categorical bars and histogram bins; the public
// components fix spacing to match their respective data semantics.
function SingleBarChart({
  data,
  valueFormatter = (value) => value.toLocaleString(),
  color = "hsl(var(--chart-1))",
  variant = "default",
  hideXAxisLabels = false,
  zeroBaseline = true,
  ariaLabel = "Bar chart",
  legend,
  tooltipHeading,
  tooltipValueLabel,
  barSpacing,
}: SingleBarChartCoreProps) {
  const firstColor = data[0]?.color ?? color;
  const hasDistinctColors = data.some(
    (datum) => (datum.color ?? color) !== firstColor,
  );

  return (
    <div className="flex size-full min-w-0 flex-col">
      <div className="min-h-0 flex-1">
        <ChartContainer>
          {({ width, height }) => (
            <CartesianLayout
              width={width}
              height={height}
              showXAxisLabels={!hideXAxisLabels}
            >
              {({ measuredPlot, maxYTicks, plotForTicks }) => {
                const values = data.flatMap((datum) =>
                  typeof datum.value === "number" &&
                  Number.isFinite(datum.value)
                    ? [datum.value]
                    : [],
                );
                const min = values.length ? Math.min(...values) : 0;
                const max = values.length ? Math.max(...values) : 1;
                const domainMin = zeroBaseline ? Math.min(0, min) : min;
                const domainMax = Math.max(
                  zeroBaseline || min < 0 ? 0 : min,
                  max,
                );
                const domainPadding = Math.max(Math.abs(domainMin) * 0.1, 1);
                const plotHeight = measuredPlot.height;
                const yScale = scaleLinear()
                  .domain(
                    domainMin === domainMax
                      ? [domainMin - domainPadding, domainMax + domainPadding]
                      : [domainMin, domainMax],
                  )
                  .nice(maxYTicks)
                  .range([measuredPlot.top + plotHeight, measuredPlot.top]);
                const yTicks = yScale.ticks(maxYTicks);
                const plot = plotForTicks(yTicks.map(valueFormatter));
                const leftMargin = plot.left;
                const plotWidth = plot.width;
                const xScale = createBarBandScale(
                  data.length,
                  leftMargin,
                  plotWidth,
                  barSpacing,
                );
                const baseline = yScale(
                  zeroBaseline || min < 0 ? 0 : (yScale.domain()[0] ?? 0),
                );
                const xTicks = data.map((datum, index) => ({
                  key: String(index),
                  x: (xScale(index) ?? leftMargin) + xScale.bandwidth() / 2,
                  label: datum.label,
                  maxWidth: xScale.bandwidth() - 8,
                }));

                if (
                  width <= 0 ||
                  height <= 0 ||
                  plotWidth <= 0 ||
                  plotHeight <= 0
                ) {
                  return (
                    <svg width={width} height={height} aria-hidden="true" />
                  );
                }

                if (barSpacing === "histogram" && xScale.bandwidth() < 1) {
                  return (
                    <div className="text-muted-foreground absolute inset-0 flex items-center justify-center p-4 text-center">
                      Insufficient space
                    </div>
                  );
                }

                const histogramInset =
                  barSpacing === "histogram" && xScale.bandwidth() >= 3 ? 1 : 0;

                return (
                  <ChartTooltip>
                    {({ activeIndex, getReferenceProps }) => (
                      <CartesianChart
                        width={width}
                        height={height}
                        ariaLabel={ariaLabel}
                        overflow="hidden"
                        plot={plot}
                        yTicks={yTicks}
                        y={yScale}
                        valueFormatter={valueFormatter}
                        zeroY={min < 0 ? yScale(0) : undefined}
                        xAxis={
                          hideXAxisLabels
                            ? undefined
                            : {
                                ticks: xTicks,
                                activeKey:
                                  activeIndex === undefined
                                    ? undefined
                                    : String(activeIndex),
                                showCategoryTicks: true,
                                alignment: "center",
                              }
                        }
                      >
                        {data.map((datum, index) => {
                          const x = xScale(index);
                          if (x === undefined) return null;
                          const barColor = datum.color ?? color;
                          const y =
                            datum.value !== null && Number.isFinite(datum.value)
                              ? yScale(datum.value)
                              : baseline;
                          const barTop = Math.min(y, baseline);
                          const barHeight = Math.abs(y - baseline);
                          const active = activeIndex === index;
                          let colorStrength = 100;
                          if (variant === "subtle") {
                            colorStrength = active ? 60 : 30;
                          }
                          if (activeIndex !== undefined && !active) {
                            colorStrength =
                              variant === "subtle"
                                ? 15
                                : INACTIVE_CHART_COLOR_STRENGTH;
                          }
                          const fill =
                            colorStrength === 100
                              ? barColor
                              : `color-mix(in srgb, ${barColor} ${colorStrength}%, hsl(var(--background)))`;
                          const previousX = xScale(index - 1);
                          const nextX = xScale(index + 1);
                          const centerX = x + xScale.bandwidth() / 2;
                          const hoverLeft =
                            previousX === undefined
                              ? plot.left
                              : (previousX + xScale.bandwidth() / 2 + centerX) /
                                2;
                          const hoverRight =
                            nextX === undefined
                              ? plot.left + plot.width
                              : (centerX + nextX + xScale.bandwidth() / 2) / 2;
                          const tooltipData = {
                            type: "primary" as const,
                            index,
                            label: tooltipValueLabel ?? datum.label,
                            value: valueFormatter(datum.value ?? 0),
                            heading: tooltipHeading?.(datum.label),
                            color: hasDistinctColors ? barColor : undefined,
                            hint: "Click or press Enter to copy label",
                            copyLabel: datum.label,
                          };
                          const { onPointerLeave, ...referenceProps } =
                            getReferenceProps(tooltipData);
                          return (
                            <g key={index} onPointerLeave={onPointerLeave}>
                              {datum.value !== null &&
                              Number.isFinite(datum.value) ? (
                                <>
                                  {barSpacing === "default" ? (
                                    <rect
                                      data-bar-hover-area=""
                                      x={hoverLeft}
                                      y={plot.top}
                                      width={hoverRight - hoverLeft}
                                      height={plot.height}
                                      fill="transparent"
                                      aria-hidden="true"
                                      {...referenceProps}
                                    />
                                  ) : null}
                                  <rect
                                    x={x + histogramInset}
                                    y={barTop}
                                    width={
                                      xScale.bandwidth() - histogramInset * 2
                                    }
                                    height={Math.max(1, barHeight)}
                                    rx={
                                      barSpacing === "histogram"
                                        ? 0
                                        : Math.min(4, barHeight / 2)
                                    }
                                    fill={fill}
                                    role="graphics-symbol"
                                    tabIndex={0}
                                    aria-label={`${datum.label}: ${valueFormatter(datum.value)}`}
                                    className="outline-hidden transition-[fill] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
                                    {...getReferenceProps(tooltipData)}
                                    onPointerLeave={undefined}
                                  />
                                </>
                              ) : null}
                            </g>
                          );
                        })}
                      </CartesianChart>
                    )}
                  </ChartTooltip>
                );
              }}
            </CartesianLayout>
          )}
        </ChartContainer>
      </div>
      {legend?.items.length ? <ChartLegend items={legend.items} /> : null}
    </div>
  );
}

function MultiSeriesBarChart({
  data,
  series,
  valueFormatter = (value) => value.toLocaleString(),
  tickFormatter = (value) => value,
  categoryXAxisLabels = false,
  tooltipFormatter = (value) => value,
  hideXAxisLabels = false,
  sync,
  legend,
  layout,
}: MultiSeriesBarChartCoreProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number>();
  const clipId = useId();
  const summaries = new Map(
    series.map((item) => {
      const values = data.flatMap((datum) => {
        const value = datum.values[item.id];
        return typeof value === "number" && Number.isFinite(value)
          ? [value]
          : [];
      });
      return [
        item.id,
        values.length ? values.reduce((sum, value) => sum + value, 0) : null,
      ] as const;
    }),
  );
  const initialHidden = new Set<string>();
  if (
    legend?.visibility !== "hidden" &&
    legend?.interaction === "toggle" &&
    legend.maxVisibleSeries !== undefined
  ) {
    const keep = new Set(
      [...series]
        .sort(
          (left, right) =>
            (summaries.get(right.id) ?? -Infinity) -
            (summaries.get(left.id) ?? -Infinity),
        )
        .slice(0, Math.max(0, legend.maxVisibleSeries))
        .map((item) => item.id),
    );
    for (const item of series)
      if (!keep.has(item.id)) initialHidden.add(item.id);
  }
  const seedKey = `${legend?.visibility ?? "hidden"}|${legend?.visibility !== "hidden" ? legend?.interaction : ""}|${legend?.visibility !== "hidden" && legend?.interaction === "toggle" ? (legend.maxVisibleSeries ?? "") : ""}|${JSON.stringify(series.map((item) => item.id).sort())}`;
  const [legendState, setLegendState] = useState({
    seedKey,
    highlightedId: undefined as string | undefined,
    visibilityOverrides: new Map<string, boolean>(),
  });
  const effectiveState =
    legendState.seedKey === seedKey
      ? legendState
      : {
          seedKey,
          highlightedId: undefined,
          visibilityOverrides: new Map<string, boolean>(),
        };
  const { highlightedId, visibilityOverrides } = effectiveState;
  const hiddenIds = new Set(initialHidden);
  for (const [id, hidden] of visibilityOverrides) {
    if (hidden) hiddenIds.add(id);
    else hiddenIds.delete(id);
  }
  const visibleSeries = series.filter((item) => !hiddenIds.has(item.id));
  const showLegend =
    legend?.visibility === "visible" ||
    (legend?.visibility === "auto" &&
      (series.length > 1 || hiddenIds.size > 0));
  const totals = data.map((datum) => {
    let positive = 0;
    let negative = 0;
    for (const item of visibleSeries) {
      const value = datum.values[item.id];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      if (value >= 0) positive += value;
      else negative += value;
    }
    return { positive, negative };
  });
  const individualValues = data.flatMap((datum) =>
    visibleSeries.flatMap((item) => {
      const value = datum.values[item.id];
      return typeof value === "number" && Number.isFinite(value) ? [value] : [];
    }),
  );
  const min =
    layout === "grouped"
      ? Math.min(0, ...individualValues)
      : Math.min(0, ...totals.map((total) => total.negative));
  const max =
    layout === "grouped"
      ? Math.max(1, ...individualValues)
      : Math.max(1, ...totals.map((total) => total.positive));

  return (
    <div className="flex size-full min-w-0 flex-col">
      <div className="min-h-0 flex-1">
        <ChartContainer>
          {({ width, height }) => (
            <CartesianLayout
              width={width}
              height={height}
              showXAxisLabels={!hideXAxisLabels}
            >
              {({ measuredPlot, maxYTicks, plotForTicks }) => {
                const y = scaleLinear()
                  .domain([min, max])
                  .nice(maxYTicks)
                  .range([
                    measuredPlot.top + measuredPlot.height,
                    measuredPlot.top,
                  ]);
                const yTicks = y.ticks(maxYTicks);
                const plot = plotForTicks(yTicks.map(valueFormatter));
                const x = createBarBandScale(
                  data.length,
                  plot.left,
                  plot.width,
                  "default",
                );
                const syncedIndex = data.findIndex(
                  (datum) => datum.key === sync?.activeKey,
                );
                const activeIndex = hoveredIndex ?? syncedIndex;
                let previousTickRight = -Infinity;
                const xTicks: {
                  key: string;
                  x: number;
                  label: string;
                  maxWidth?: number;
                  textAnchor?: "end";
                }[] = [];
                data.forEach((datum, index) => {
                  const label = tickFormatter(datum.key);
                  const center = (x(index) ?? plot.left) + x.bandwidth() / 2;
                  if (layout === "grouped") {
                    const maxWidth = Math.max(0, x.bandwidth() - 16);
                    const labelWidth = Math.min(label.length * 7, maxWidth);
                    if (
                      maxWidth < 14 ||
                      center - labelWidth / 2 < previousTickRight + 16 ||
                      center + labelWidth / 2 > width - 8
                    ) {
                      return;
                    }
                    xTicks.push({
                      key: datum.key,
                      x: center,
                      label,
                      maxWidth,
                    });
                    previousTickRight = center + labelWidth / 2;
                    return;
                  }
                  const labelWidth = label.length * 7;
                  if (categoryXAxisLabels) {
                    const right = Math.min(width - 8, center);
                    const left = right - labelWidth;
                    if (left >= 8 && left >= previousTickRight + 16) {
                      xTicks.push({
                        key: datum.key,
                        x: right,
                        label,
                        textAnchor: "end",
                      });
                      previousTickRight = right;
                    }
                    return;
                  }
                  if (index === data.length - 1) {
                    const right = Math.min(width - 8, center + labelWidth / 2);
                    const left = right - labelWidth;
                    while (xTicks.length > 0 && left < previousTickRight + 16) {
                      xTicks.pop();
                      const previous = xTicks.at(-1);
                      previousTickRight = previous
                        ? previous.x + previous.label.length * 3.5
                        : -Infinity;
                    }
                    if (left >= 8) {
                      xTicks.push({
                        key: datum.key,
                        x: right,
                        label,
                        textAnchor: "end",
                      });
                    }
                    return;
                  }
                  const left = center - labelWidth / 2;
                  if (
                    left < previousTickRight + 16 ||
                    center + labelWidth / 2 > width - 8
                  ) {
                    return;
                  }
                  previousTickRight = center + labelWidth / 2;
                  xTicks.push({ key: datum.key, x: center, label });
                });

                if (
                  width <= 0 ||
                  height <= 0 ||
                  plot.width <= 0 ||
                  plot.height <= 0
                ) {
                  return (
                    <svg width={width} height={height} aria-hidden="true" />
                  );
                }

                return (
                  <ChartTooltip>
                    {({ activeIndex: tooltipIndex, getReferenceProps }) => (
                      <CartesianChart
                        width={width}
                        height={height}
                        ariaLabel={
                          layout === "grouped"
                            ? "Grouped bar chart"
                            : "Stacked bar chart"
                        }
                        plot={plot}
                        yTicks={yTicks}
                        y={y}
                        valueFormatter={valueFormatter}
                        zeroY={min < 0 ? y(0) : undefined}
                        xAxis={
                          hideXAxisLabels
                            ? undefined
                            : {
                                ticks: xTicks,
                                activeKey:
                                  activeIndex >= 0
                                    ? data[activeIndex]?.key
                                    : undefined,
                                showCategoryTicks: layout === "grouped",
                                alignment: "center",
                              }
                        }
                      >
                        {data.map((datum, index) => {
                          const left = x(index);
                          if (left === undefined) return null;
                          let positive = 0;
                          let negative = 0;
                          const items = visibleSeries.flatMap((item) => {
                            const value = datum.values[item.id];
                            return typeof value === "number" &&
                              Number.isFinite(value)
                              ? [
                                  {
                                    id: item.id,
                                    label: item.label,
                                    value: valueFormatter(value),
                                    color: item.color,
                                  },
                                ]
                              : [];
                          });
                          const referenceProps = getReferenceProps({
                            type: "items",
                            index,
                            heading: tooltipFormatter(datum.key),
                            items: items.sort(
                              (a, b) =>
                                (datum.values[b.id] ?? 0) -
                                (datum.values[a.id] ?? 0),
                            ),
                          });
                          return (
                            <g key={`${datum.key}-${index}`}>
                              <defs>
                                <clipPath id={`${clipId}-positive-${index}`}>
                                  <rect
                                    x={left}
                                    y={y(totals[index]?.positive ?? 0)}
                                    width={x.bandwidth()}
                                    height={
                                      y(0) - y(totals[index]?.positive ?? 0)
                                    }
                                    rx={4}
                                  />
                                </clipPath>
                                <clipPath id={`${clipId}-negative-${index}`}>
                                  <rect
                                    x={left}
                                    y={y(0)}
                                    width={x.bandwidth()}
                                    height={
                                      y(totals[index]?.negative ?? 0) - y(0)
                                    }
                                    rx={4}
                                  />
                                </clipPath>
                              </defs>
                              <rect
                                x={left}
                                y={plot.top}
                                width={x.bandwidth()}
                                height={plot.height}
                                fill="transparent"
                                aria-hidden="true"
                                {...referenceProps}
                                onPointerEnter={(event) => {
                                  referenceProps.onPointerEnter(event);
                                  setHoveredIndex(index);
                                  sync?.onActiveKeyChange(datum.key);
                                }}
                                onPointerMove={(event) => {
                                  referenceProps.onPointerMove(event);
                                  setHoveredIndex(index);
                                  sync?.onActiveKeyChange(datum.key);
                                }}
                                onPointerLeave={() => {
                                  referenceProps.onPointerLeave();
                                  setHoveredIndex(undefined);
                                  sync?.onActiveKeyChange(undefined);
                                }}
                              />
                              {visibleSeries.map((item, seriesIndex) => {
                                const value = datum.values[item.id];
                                if (
                                  typeof value !== "number" ||
                                  !Number.isFinite(value)
                                )
                                  return null;
                                let start = 0;
                                if (layout === "stacked") {
                                  start = value >= 0 ? positive : negative;
                                }
                                if (value >= 0) positive += value;
                                else negative += value;
                                const top =
                                  value === 0
                                    ? y(start) - 1
                                    : Math.min(y(start), y(start + value));
                                const barHeight = Math.max(
                                  1,
                                  Math.abs(y(start) - y(start + value)),
                                );
                                let colorStrength = 100;
                                if (
                                  highlightedId !== undefined &&
                                  item.id !== highlightedId
                                )
                                  colorStrength = 20;
                                else if (
                                  tooltipIndex !== undefined &&
                                  tooltipIndex !== index
                                )
                                  colorStrength = 30;
                                const barWidth =
                                  layout === "grouped"
                                    ? x.bandwidth() /
                                      Math.max(visibleSeries.length, 1)
                                    : x.bandwidth();
                                const barLeft =
                                  left +
                                  (layout === "grouped"
                                    ? seriesIndex * barWidth
                                    : 0);
                                const radius = Math.min(
                                  4,
                                  barWidth / 2,
                                  barHeight / 2,
                                );
                                const barPath =
                                  value >= 0
                                    ? `M ${barLeft} ${top + barHeight} V ${top + radius} Q ${barLeft} ${top} ${barLeft + radius} ${top} H ${barLeft + barWidth - radius} Q ${barLeft + barWidth} ${top} ${barLeft + barWidth} ${top + radius} V ${top + barHeight} Z`
                                    : `M ${barLeft} ${top} V ${top + barHeight - radius} Q ${barLeft} ${top + barHeight} ${barLeft + radius} ${top + barHeight} H ${barLeft + barWidth - radius} Q ${barLeft + barWidth} ${top + barHeight} ${barLeft + barWidth} ${top + barHeight - radius} V ${top} Z`;
                                const fill =
                                  colorStrength === 100
                                    ? item.color
                                    : `color-mix(in srgb, ${item.color} ${colorStrength}%, hsl(var(--background)))`;
                                const sharedBarProps = {
                                  fill,
                                  role: "graphics-symbol" as const,
                                  tabIndex: 0,
                                  "aria-label": `${item.label}: ${valueFormatter(value)}`,
                                  className:
                                    "outline-hidden transition-[fill] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2",
                                  ...referenceProps,
                                  onPointerEnter: (
                                    event: React.PointerEvent<SVGElement>,
                                  ) => {
                                    referenceProps.onPointerEnter(event);
                                    setHoveredIndex(index);
                                    sync?.onActiveKeyChange(datum.key);
                                  },
                                  onPointerMove: (
                                    event: React.PointerEvent<SVGElement>,
                                  ) => {
                                    referenceProps.onPointerMove(event);
                                    setHoveredIndex(index);
                                    sync?.onActiveKeyChange(datum.key);
                                  },
                                  onFocus: (
                                    event: React.FocusEvent<SVGElement>,
                                  ) => {
                                    referenceProps.onFocus(event);
                                    setHoveredIndex(index);
                                    sync?.onActiveKeyChange(datum.key);
                                  },
                                  onPointerLeave: () => {
                                    referenceProps.onPointerLeave();
                                    setHoveredIndex(undefined);
                                    sync?.onActiveKeyChange(undefined);
                                  },
                                  onBlur: () => {
                                    referenceProps.onBlur();
                                    setHoveredIndex(undefined);
                                    sync?.onActiveKeyChange(undefined);
                                  },
                                };
                                if (layout === "stacked") {
                                  return (
                                    <rect
                                      key={item.id}
                                      x={barLeft}
                                      y={top}
                                      width={barWidth}
                                      height={barHeight}
                                      clipPath={
                                        value === 0
                                          ? undefined
                                          : `url(#${clipId}-${value >= 0 ? "positive" : "negative"}-${index})`
                                      }
                                      {...sharedBarProps}
                                    />
                                  );
                                }
                                return (
                                  <path
                                    key={item.id}
                                    d={barPath}
                                    {...sharedBarProps}
                                  />
                                );
                              })}
                            </g>
                          );
                        })}
                      </CartesianChart>
                    )}
                  </ChartTooltip>
                );
              }}
            </CartesianLayout>
          )}
        </ChartContainer>
      </div>
      {showLegend ? (
        <ChartLegend
          selectionActions={
            legend.interaction === "toggle"
              ? {
                  allSelected: hiddenIds.size === 0,
                  onSelectAll: () =>
                    setLegendState({
                      ...effectiveState,
                      visibilityOverrides: new Map(
                        series.map((item) => [item.id, false]),
                      ),
                    }),
                  onDeselectAll: () =>
                    setLegendState({
                      ...effectiveState,
                      visibilityOverrides: new Map(
                        series.map((item) => [item.id, true]),
                      ),
                    }),
                }
              : undefined
          }
          items={series.map((item) => {
            const hidden = hiddenIds.has(item.id);
            const focused = highlightedId === item.id;
            let label = `Show only ${item.label}`;
            if (legend.interaction === "toggle")
              label = hidden ? `Show ${item.label}` : `Hide ${item.label}`;
            else if (focused) label = "Show all series";
            const summary = summaries.get(item.id);
            return {
              id: item.id,
              label: item.label,
              color: item.color,
              value:
                legend.summary === "sum" &&
                summary !== null &&
                summary !== undefined
                  ? { label: "Sum", value: valueFormatter(summary) }
                  : undefined,
              muted:
                hidden ||
                (legend.interaction === "highlight" &&
                  highlightedId !== undefined &&
                  !focused),
              action: {
                label,
                pressed: legend.interaction === "toggle" ? !hidden : focused,
                onClick: () => {
                  if (legend.interaction === "toggle") {
                    const next = new Map(visibilityOverrides);
                    next.set(item.id, !hidden);
                    setLegendState({
                      ...effectiveState,
                      visibilityOverrides: next,
                    });
                    return;
                  }
                  setLegendState({
                    ...effectiveState,
                    highlightedId: focused ? undefined : item.id,
                  });
                },
              },
            };
          })}
        />
      ) : null}
    </div>
  );
}
