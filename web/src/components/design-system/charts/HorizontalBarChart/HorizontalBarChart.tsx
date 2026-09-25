"use client";

import { scaleLinear } from "d3-scale";

import { ChartContainer } from "@/src/components/design-system/charts/ChartContainer";
import {
  CHART_TRANSITION_DURATION,
  INACTIVE_CHART_COLOR_STRENGTH,
} from "@/src/components/design-system/charts/constants";
import type { BarChartDatum } from "@/src/components/design-system/internal/charts/BarChartCore";
import { CARTESIAN_CHART_INSETS } from "@/src/components/design-system/internal/charts/CartesianLayout";
import { ChartTooltip } from "@/src/components/design-system/internal/charts/ChartTooltip";

const MIN_ROW_PX = 14;
const CHARACTER_WIDTH = 7;
const MAX_GRIDLINE_TO_VALUE_GAP = 24;

export function HorizontalBarChart({
  data,
  valueFormatter = (value) => value.toLocaleString(),
  color = "hsl(var(--chart-1))",
}: {
  data: BarChartDatum[];
  valueFormatter?: (value: number) => string;
  color?: string;
}) {
  const maxMagnitude = Math.max(
    ...data.map((datum) => Math.abs(datum.value ?? 0)),
    0,
  );
  const scale = scaleLinear()
    .domain([0, maxMagnitude || 1])
    .nice(4);
  const rightTick = scale.domain()[1] ?? 1;
  const ticks = scale.ticks(4);
  if (ticks.at(-1) !== rightTick) ticks.push(rightTick);
  const firstColor = data[0]?.color ?? color;
  const hasDistinctColors = data.some(
    (datum) => (datum.color ?? color) !== firstColor,
  );

  return (
    <ChartContainer>
      {({ width, height }) => {
        const left = CARTESIAN_CHART_INSETS.top;
        const top = CARTESIAN_CHART_INSETS.bottomWithLabels;
        const right = CARTESIAN_CHART_INSETS.right;
        const bottom = CARTESIAN_CHART_INSETS.bottomWithoutLabels;
        const valueChars = Math.max(
          2,
          ...data.map((datum) => valueFormatter(datum.value ?? 0).length),
        );
        const plotWidth = Math.max(
          0,
          width - left - right - valueChars * CHARACTER_WIDTH - 8,
        );
        const plotHeight = Math.max(0, height - top - bottom);
        const gap = Math.min(
          32,
          Math.max(1, (plotHeight / Math.max(1, data.length)) * 0.12),
        );
        const rowHeight = Math.max(
          MIN_ROW_PX,
          (plotHeight - gap * (data.length + 1)) / Math.max(1, data.length),
        );
        const contentHeight = Math.max(
          height,
          top + bottom + data.length * rowHeight + gap * (data.length + 1),
        );
        const valueRight = width - right;
        const rightTickLeft =
          plotWidth - (valueFormatter(rightTick).length * CHARACTER_WIDTH) / 2;
        let previousTickEnd = -Infinity;
        const visibleTicks = ticks.filter((tick, index) => {
          if (tick === rightTick) return true;
          const labelWidth = valueFormatter(tick).length * CHARACTER_WIDTH;
          const tickLeft =
            index === 0 ? 0 : scale(tick) * plotWidth - labelWidth / 2;
          if (
            tickLeft < previousTickEnd + 8 ||
            tickLeft + labelWidth + 8 > rightTickLeft
          ) {
            return false;
          }
          previousTickEnd = tickLeft + labelWidth;
          return true;
        });

        return (
          <ChartTooltip>
            {({ activeIndex, hideTooltip, getReferenceProps }) => (
              <div
                className="size-full overflow-x-hidden overflow-y-auto"
                data-testid="top-list-chart"
              >
                <svg
                  onPointerLeave={hideTooltip}
                  width={width}
                  height={contentHeight}
                  role="group"
                  aria-label="Horizontal bar chart"
                  className="block"
                >
                  <rect
                    width={width}
                    height={contentHeight}
                    fill="transparent"
                    aria-hidden="true"
                  />
                  <g aria-hidden="true">
                    {visibleTicks.map((tick) => {
                      const x = left + scale(tick) * plotWidth;
                      return (
                        <g key={tick} data-axis-tick="">
                          <line
                            x1={x}
                            x2={x}
                            y1={top}
                            y2={contentHeight - bottom}
                            stroke="hsl(var(--chart-grid))"
                          />
                          <text
                            x={x}
                            y={top - 8}
                            textAnchor={tick === 0 ? "start" : "middle"}
                            fill="hsl(var(--muted-foreground))"
                            fontSize={12}
                          >
                            {valueFormatter(tick)}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                  {data.map((datum, index) => {
                    const value = datum.value ?? 0;
                    const formattedValue = valueFormatter(value);
                    const barWidth =
                      maxMagnitude > 0 ? scale(Math.abs(value)) * plotWidth : 0;
                    const y = top + gap + index * (rowHeight + gap);
                    const insideLabelRoom = Math.max(0, barWidth - 16);
                    const outsideLabelRoom = Math.max(
                      0,
                      plotWidth - barWidth - 24,
                    );
                    const labelOutside =
                      insideLabelRoom < datum.label.length * CHARACTER_WIDTH &&
                      outsideLabelRoom > insideLabelRoom;
                    const labelRoom = labelOutside
                      ? outsideLabelRoom
                      : insideLabelRoom;
                    const maxCharacters = Math.floor(
                      labelRoom / CHARACTER_WIDTH,
                    );
                    let visibleLabel = datum.label;
                    if (maxCharacters < 1) visibleLabel = "";
                    else if (datum.label.length > maxCharacters) {
                      visibleLabel = `${datum.label.slice(0, Math.max(0, maxCharacters - 1))}…`;
                    }
                    const labelX = left + barWidth + 8;
                    const inactive =
                      activeIndex !== undefined && activeIndex !== index;
                    const inactiveTextColor = inactive
                      ? "color-mix(in srgb, hsl(var(--foreground)) 40%, hsl(var(--background)))"
                      : "hsl(var(--foreground))";
                    const tooltipData = {
                      type: "primary" as const,
                      index,
                      label: datum.label,
                      value: formattedValue,
                      color: hasDistinctColors
                        ? (datum.color ?? color)
                        : undefined,
                      hint: "Click or press Enter to copy label",
                      copyLabel: datum.label,
                    };
                    const {
                      onPointerLeave: _onPointerLeave,
                      ...referenceProps
                    } = getReferenceProps(tooltipData);

                    return (
                      <g
                        key={`${datum.label}-${index}`}
                        ref={(row) => {
                          if (!row) return;
                          const label =
                            row.querySelector<SVGTextElement>(
                              "[data-row-label]",
                            );
                          const value =
                            row.querySelector<SVGTextElement>(
                              "[data-row-value]",
                            );
                          const leader =
                            row.querySelector<SVGLineElement>(
                              "[data-leader-line]",
                            );
                          if (!label || !value || !leader) return;
                          const labelBounds = label.getBBox();
                          const valueBounds = value.getBBox();
                          const start = Math.max(
                            left + barWidth + 4,
                            labelBounds.x + labelBounds.width + 4,
                          );
                          const valueEnd = valueBounds.x - 4;
                          const gridlineX = left + plotWidth;
                          const end =
                            valueEnd - gridlineX > MAX_GRIDLINE_TO_VALUE_GAP
                              ? valueEnd
                              : Math.min(valueEnd, gridlineX);
                          leader.setAttribute("x1", String(start));
                          leader.setAttribute("x2", String(end));
                          leader.setAttribute(
                            "visibility",
                            end - start > 24 ? "visible" : "hidden",
                          );
                        }}
                      >
                        <rect
                          x={left}
                          y={y}
                          width={Math.max(0, width - left - right)}
                          height={rowHeight}
                          fill="transparent"
                          aria-hidden="true"
                          {...referenceProps}
                        />
                        <rect
                          data-bar-fill=""
                          x={left}
                          y={y}
                          width={barWidth}
                          height={rowHeight}
                          rx={Math.min(4, rowHeight / 2)}
                          fill={
                            inactive
                              ? `color-mix(in srgb, ${datum.color ?? color} ${INACTIVE_CHART_COLOR_STRENGTH}%, hsl(var(--background)))`
                              : (datum.color ?? color)
                          }
                          className="transition-[fill]"
                          style={{
                            transitionDuration: CHART_TRANSITION_DURATION,
                          }}
                          pointerEvents="none"
                          aria-hidden="true"
                        />
                        <rect
                          x={left}
                          y={y}
                          width={Math.min(plotWidth, Math.max(24, barWidth))}
                          height={rowHeight}
                          fill="transparent"
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${datum.label}: ${formattedValue}`}
                          className="outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2"
                          {...referenceProps}
                        />
                        <text
                          data-row-label=""
                          x={labelOutside ? labelX : left + 8}
                          y={y + rowHeight / 2}
                          dominantBaseline="central"
                          fontSize={12}
                          fill={
                            labelOutside || inactive
                              ? inactiveTextColor
                              : undefined
                          }
                          className={
                            labelOutside || inactive
                              ? "pointer-events-none"
                              : "pointer-events-none fill-white dark:fill-black"
                          }
                        >
                          {visibleLabel}
                        </text>
                        <line
                          data-leader-line=""
                          y1={y + rowHeight / 2}
                          y2={y + rowHeight / 2}
                          stroke="hsl(var(--muted-foreground))"
                          strokeOpacity={inactive ? 0.2 : 0.4}
                          strokeDasharray="3 3"
                          aria-hidden="true"
                        />
                        <text
                          data-row-value=""
                          x={valueRight}
                          y={y + rowHeight / 2}
                          textAnchor="end"
                          dominantBaseline="central"
                          fontSize={12}
                          fill={inactiveTextColor}
                          {...referenceProps}
                        >
                          {formattedValue}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </ChartTooltip>
        );
      }}
    </ChartContainer>
  );
}
