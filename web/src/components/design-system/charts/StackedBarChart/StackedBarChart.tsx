"use client";

import { useId, useState } from "react";
import { scaleLinear } from "d3-scale";

import { ChartContainer } from "@/src/components/design-system/charts/ChartContainer";
import { ChartLegend } from "@/src/components/design-system/internal/charts/ChartLegend";
import { CartesianChart } from "@/src/components/design-system/internal/charts/CartesianChart";
import { CartesianLayout } from "@/src/components/design-system/internal/charts/CartesianLayout";
import { ChartTooltip } from "@/src/components/design-system/internal/charts/ChartTooltip";
import { createBarBandScale } from "@/src/components/design-system/internal/charts/fns/createBarBandScale";

import type { LineChartLegend } from "@/src/components/design-system/charts/LineChart/LineChart";

export function StackedBarChart({
  data,
  series,
  valueFormatter = (value) => value.toLocaleString(),
  tickFormatter = (value) => value,
  tooltipFormatter = (value) => value,
  hideXAxisLabels = false,
  sync,
  legend,
}: {
  data: { key: string; values: Record<string, number | null> }[];
  series: { id: string; label: string; color: string }[];
  valueFormatter?: (value: number) => string;
  tickFormatter?: (value: string) => string;
  tooltipFormatter?: (value: string) => string;
  hideXAxisLabels?: boolean;
  sync?: {
    activeKey: string | undefined;
    onActiveKeyChange: (key: string | undefined) => void;
  };
  legend?: LineChartLegend;
}) {
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
    hiddenIds: initialHidden,
  });
  const effectiveState =
    legendState.seedKey === seedKey
      ? legendState
      : { seedKey, highlightedId: undefined, hiddenIds: initialHidden };
  const { highlightedId, hiddenIds } = effectiveState;
  const visibleSeries = series.filter((item) => !hiddenIds.has(item.id));
  const showLegend =
    legend?.visibility === "visible" ||
    (legend?.visibility === "auto" && series.length > 1);
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
  const min = Math.min(0, ...totals.map((total) => total.negative));
  const max = Math.max(1, ...totals.map((total) => total.positive));

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
                const xTicks = data.flatMap((datum, index) => {
                  const label = tickFormatter(datum.key);
                  const center = (x(index) ?? plot.left) + x.bandwidth() / 2;
                  const labelWidth = label.length * 7;
                  const left = center - labelWidth / 2;
                  if (
                    left < previousTickRight + 16 ||
                    center + labelWidth / 2 > width - 8
                  ) {
                    return [];
                  }
                  previousTickRight = center + labelWidth / 2;
                  return [{ key: datum.key, x: center, label }];
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
                        ariaLabel="Stacked bar chart"
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
                                alignment: "center",
                              }
                        }
                      >
                        {activeIndex >= 0 && activeIndex < data.length ? (
                          <line
                            data-active-reference-line=""
                            x1={
                              (x(activeIndex) ?? plot.left) + x.bandwidth() / 2
                            }
                            x2={
                              (x(activeIndex) ?? plot.left) + x.bandwidth() / 2
                            }
                            y1={plot.top}
                            y2={plot.top + plot.height}
                            stroke="hsl(var(--muted-foreground))"
                            strokeDasharray="3 3"
                            aria-hidden="true"
                          />
                        ) : null}
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
                              {visibleSeries.map((item) => {
                                const value = datum.values[item.id];
                                if (
                                  typeof value !== "number" ||
                                  !Number.isFinite(value)
                                )
                                  return null;
                                const start = value >= 0 ? positive : negative;
                                if (value >= 0) positive += value;
                                else negative += value;
                                const top = Math.min(
                                  y(start),
                                  y(start + value),
                                );
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
                                const fill =
                                  colorStrength === 100
                                    ? item.color
                                    : `color-mix(in srgb, ${item.color} ${colorStrength}%, hsl(var(--background)))`;
                                return (
                                  <rect
                                    key={item.id}
                                    x={left}
                                    y={top}
                                    width={x.bandwidth()}
                                    height={barHeight}
                                    clipPath={`url(#${clipId}-${value >= 0 ? "positive" : "negative"}-${index})`}
                                    fill={fill}
                                    role="graphics-symbol"
                                    tabIndex={0}
                                    aria-label={`${item.label}: ${valueFormatter(value)}`}
                                    className="outline-hidden transition-[fill] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
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
                                    onFocus={(event) => {
                                      referenceProps.onFocus(event);
                                      setHoveredIndex(index);
                                      sync?.onActiveKeyChange(datum.key);
                                    }}
                                    onPointerLeave={() => {
                                      referenceProps.onPointerLeave();
                                      setHoveredIndex(undefined);
                                      sync?.onActiveKeyChange(undefined);
                                    }}
                                    onBlur={() => {
                                      referenceProps.onBlur();
                                      setHoveredIndex(undefined);
                                      sync?.onActiveKeyChange(undefined);
                                    }}
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
                    setLegendState({ ...effectiveState, hiddenIds: new Set() }),
                  onDeselectAll: () =>
                    setLegendState({
                      ...effectiveState,
                      hiddenIds: new Set(series.map((item) => item.id)),
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
                    const next = new Set(hiddenIds);
                    if (hidden) next.delete(item.id);
                    else next.add(item.id);
                    setLegendState({ ...effectiveState, hiddenIds: next });
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
