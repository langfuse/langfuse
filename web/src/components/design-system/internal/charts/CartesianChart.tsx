"use client";

import { useId, type ReactNode } from "react";

import type { CartesianPlot } from "@/src/components/design-system/internal/charts/CartesianLayout";

function ChartGrid({
  yTicks,
  y,
  left,
  top,
  width,
  height,
  categoryBoundaries = false,
}: {
  yTicks: number[];
  y: (value: number) => number;
  left: number;
  top: number;
  width: number;
  height: number;
  categoryBoundaries?: boolean;
}) {
  return (
    <g aria-hidden="true">
      {yTicks.map((tick) => (
        <line
          key={tick}
          x1={left}
          x2={left + width}
          y1={y(tick)}
          y2={y(tick)}
          stroke="hsl(var(--chart-grid))"
        />
      ))}
      {categoryBoundaries
        ? [left, left + width].map((x) => (
            <line
              key={x}
              x1={x}
              x2={x}
              y1={top}
              y2={top + height}
              stroke="hsl(var(--chart-grid))"
            />
          ))
        : null}
    </g>
  );
}

function ChartXAxis({
  ticks,
  activeKey,
  y,
  width,
  showCategoryTicks = false,
  alignment = "endpoints",
}: {
  ticks: {
    key: string;
    x: number;
    label: string;
    maxWidth?: number;
    textAnchor?: "end";
  }[];
  activeKey?: string;
  y: number;
  width: number;
  showCategoryTicks?: boolean;
  alignment?: "endpoints" | "center";
}) {
  const gradientId = useId();
  const characterWidth = 7;
  const hideLabels =
    ticks.length > 0 &&
    ticks.every(
      (tick) =>
        tick.maxWidth !== undefined &&
        Math.floor(tick.maxWidth / characterWidth) <= 1 &&
        tick.label.length > 1,
    );
  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1">
          <stop offset="0" stopColor="hsl(var(--background))" stopOpacity="0" />
          <stop offset="0.12" stopColor="hsl(var(--background))" />
          <stop offset="0.88" stopColor="hsl(var(--background))" />
          <stop offset="1" stopColor="hsl(var(--background))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {showCategoryTicks
        ? ticks.map((tick) => (
            <line
              key={`category-tick-${tick.key}`}
              data-category-tick=""
              x1={tick.x}
              x2={tick.x}
              y1={y}
              y2={y + 4}
              stroke="hsl(var(--muted-foreground))"
              aria-hidden="true"
            />
          ))
        : null}
      {!hideLabels &&
        ticks
          .map((tick, index) => ({ tick, index }))
          .sort(
            (left, right) =>
              Number(left.tick.key === activeKey) -
              Number(right.tick.key === activeKey),
          )
          .map(({ tick, index }) => {
            const active = tick.key === activeKey;
            let textAnchor: "start" | "middle" | "end" = "middle";
            if (alignment === "endpoints") {
              if (ticks.length > 1 && index === 0) textAnchor = "start";
              else if (ticks.length > 1 && index === ticks.length - 1)
                textAnchor = "end";
            }
            const maxCharacters = tick.maxWidth
              ? Math.max(1, Math.floor(tick.maxWidth / characterWidth))
              : undefined;
            const label =
              !active && maxCharacters && tick.label.length > maxCharacters
                ? `${tick.label.slice(0, Math.max(0, maxCharacters - 1))}…`
                : tick.label;
            const activeLabelWidth = Math.min(
              width - 16,
              tick.label.length * characterWidth + 96,
            );
            const activeLabelX = Math.max(
              8,
              Math.min(
                width - 8 - activeLabelWidth,
                tick.x - activeLabelWidth / 2,
              ),
            );
            const activeTextWidth = Math.min(
              width - 32,
              tick.label.length * characterWidth,
            );
            const activeTextX = Math.max(
              16 + activeTextWidth / 2,
              Math.min(width - 16 - activeTextWidth / 2, tick.x),
            );

            return (
              <g key={tick.key}>
                {active ? (
                  <rect
                    data-active-x-axis-label-background=""
                    x={activeLabelX}
                    y={y + 4}
                    width={activeLabelWidth}
                    height={17}
                    rx={2}
                    fill={`url(#${gradientId})`}
                  />
                ) : null}
                <text
                  data-x-axis-label=""
                  data-active-x-axis-label={active ? "" : undefined}
                  x={active ? activeTextX : tick.x}
                  y={y + 16}
                  textAnchor={
                    active ? "middle" : (tick.textAnchor ?? textAnchor)
                  }
                  textLength={
                    active &&
                    tick.label.length * characterWidth > activeTextWidth
                      ? activeTextWidth
                      : undefined
                  }
                  lengthAdjust="spacingAndGlyphs"
                  fill={
                    active
                      ? "hsl(var(--foreground))"
                      : "hsl(var(--muted-foreground))"
                  }
                  fontSize={12}
                  fontWeight={active ? 700 : undefined}
                >
                  {label}
                </text>
              </g>
            );
          })}
    </g>
  );
}

function ChartYAxis({
  ticks,
  y,
  left,
  valueFormatter,
}: {
  ticks: number[];
  y: (value: number) => number;
  left: number;
  valueFormatter: (value: number) => string;
}) {
  return ticks.map((tick, index) => {
    let dominantBaseline: "middle" | "text-after-edge" | "text-before-edge" =
      "middle";
    if (index === 0) dominantBaseline = "text-after-edge";
    else if (index === ticks.length - 1) dominantBaseline = "text-before-edge";

    return (
      <text
        key={tick}
        x={left - 8}
        y={y(tick)}
        textAnchor="end"
        dominantBaseline={dominantBaseline}
        fill="hsl(var(--muted-foreground))"
        fontSize={12}
      >
        {valueFormatter(tick)}
      </text>
    );
  });
}

export function CartesianChart({
  width,
  height,
  ariaLabel,
  overflow = "visible",
  plot,
  yTicks,
  y,
  valueFormatter,
  categoryBoundaries = false,
  zeroY,
  xAxis,
  children,
}: {
  width: number;
  height: number;
  ariaLabel: string;
  overflow?: "visible" | "hidden";
  plot: CartesianPlot;
  yTicks: number[];
  y: (value: number) => number;
  valueFormatter: (value: number) => string;
  categoryBoundaries?: boolean;
  zeroY?: number;
  xAxis?: {
    ticks: {
      key: string;
      x: number;
      label: string;
      maxWidth?: number;
      textAnchor?: "end";
    }[];
    activeKey?: string;
    showCategoryTicks?: boolean;
    alignment?: "endpoints" | "center";
  };
  children: ReactNode;
}) {
  return (
    <svg
      width={width}
      height={height}
      role="group"
      aria-label={ariaLabel}
      className={
        overflow === "hidden"
          ? "block overflow-hidden"
          : "block overflow-visible"
      }
    >
      <ChartGrid
        yTicks={yTicks}
        y={y}
        left={plot.left}
        top={plot.top}
        width={plot.width}
        height={plot.height}
        categoryBoundaries={categoryBoundaries}
      />
      {zeroY !== undefined ? (
        <line
          data-zero-baseline=""
          x1={plot.left}
          x2={plot.left + plot.width}
          y1={zeroY}
          y2={zeroY}
          stroke="hsl(var(--foreground))"
          strokeWidth={1.5}
          opacity={0.6}
          aria-hidden="true"
        />
      ) : null}
      <ChartYAxis
        ticks={yTicks}
        y={y}
        left={plot.left}
        valueFormatter={valueFormatter}
      />
      {children}
      {xAxis ? (
        <ChartXAxis
          ticks={xAxis.ticks}
          activeKey={xAxis.activeKey}
          y={plot.top + plot.height}
          width={width}
          showCategoryTicks={xAxis.showCategoryTicks}
          alignment={xAxis.alignment}
        />
      ) : null}
    </svg>
  );
}
