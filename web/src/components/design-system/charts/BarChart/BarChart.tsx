"use client";

import { scaleBand, scaleLinear } from "d3-scale";

import { ChartContainer } from "@/src/components/design-system/charts/ChartContainer";
import { CartesianChart } from "@/src/components/design-system/internal/charts/CartesianChart";
import { CartesianLayout } from "@/src/components/design-system/internal/charts/CartesianLayout";
import {
  ChartLegend,
  type ChartLegendItem,
} from "@/src/components/design-system/internal/charts/ChartLegend";
import { ChartTooltip } from "@/src/components/design-system/internal/charts/ChartTooltip";

export type BarChartDatum = {
  label: string;
  value: number | null;
  color?: string;
};

type BarChartProps = {
  data: BarChartDatum[];
  valueFormatter?: (value: number) => string;
  color?: string;
  variant?: "default" | "subtle";
  hideXAxisLabels?: boolean;
  zeroBaseline?: boolean;
  ariaLabel?: string;
  legend?: { items: ChartLegendItem[] };
};

export function BarChart({
  data,
  valueFormatter = (value) => value.toLocaleString(),
  color = "hsl(var(--chart-1))",
  variant = "default",
  hideXAxisLabels = false,
  zeroBaseline = false,
  ariaLabel = "Bar chart",
  legend,
}: BarChartProps) {
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
                const xScale = scaleBand<number>()
                  .domain(data.map((_, index) => index))
                  .range([leftMargin, leftMargin + plotWidth])
                  .paddingInner(0.2)
                  .paddingOuter(0.1);
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
                            colorStrength = variant === "subtle" ? 15 : 20;
                          }
                          const fill =
                            colorStrength === 100
                              ? barColor
                              : `color-mix(in srgb, ${barColor} ${colorStrength}%, hsl(var(--background)))`;
                          return (
                            <g key={index}>
                              {datum.value !== null &&
                              Number.isFinite(datum.value) ? (
                                <rect
                                  x={x}
                                  y={barTop}
                                  width={xScale.bandwidth()}
                                  height={Math.max(1, barHeight)}
                                  rx={Math.min(4, barHeight / 2)}
                                  fill={fill}
                                  role="graphics-symbol"
                                  tabIndex={0}
                                  aria-label={`${datum.label}: ${valueFormatter(datum.value)}`}
                                  className="outline-hidden transition-[fill] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
                                  {...getReferenceProps({
                                    type: "primary",
                                    index,
                                    label: datum.label,
                                    value: valueFormatter(datum.value),
                                    color: hasDistinctColors
                                      ? barColor
                                      : undefined,
                                  })}
                                />
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
