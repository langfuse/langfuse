"use client";

import type { ReactNode } from "react";

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
  activeTick,
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
  activeTick?: { key: string; x: number; label: string };
  y: number;
  width: number;
  showCategoryTicks?: boolean;
  alignment?: "endpoints" | "center";
}) {
  const characterWidth = 7;
  const hideLabels =
    ticks.length > 0 &&
    ticks.every(
      (tick) =>
        tick.maxWidth !== undefined &&
        Math.floor(tick.maxWidth / characterWidth) <= 1 &&
        tick.label.length > 1,
    );
  const axisTicks: typeof ticks = activeTick
    ? [...ticks.filter((tick) => tick.key !== activeTick.key), activeTick].sort(
        (left, right) => left.x - right.x,
      )
    : ticks;
  const labels = axisTicks.map((tick, index) => {
    let textAnchor: "start" | "middle" | "end" = "middle";
    if (alignment === "endpoints" && ticks.length > 1) {
      if (index === 0) textAnchor = "start";
      else if (index === ticks.length - 1) textAnchor = "end";
    }
    const anchor = tick.textAnchor ?? textAnchor;
    const maxCharacters = tick.maxWidth
      ? Math.max(1, Math.floor(tick.maxWidth / characterWidth))
      : undefined;
    const label =
      maxCharacters && tick.label.length > maxCharacters
        ? `${tick.label.slice(0, Math.max(0, maxCharacters - 1))}…`
        : tick.label;
    const labelWidth = label.length * characterWidth;
    const x = tick.x;
    const left =
      anchor === "middle"
        ? x - labelWidth / 2
        : anchor === "end"
          ? x - labelWidth
          : x;
    return { tick, index, active: false, anchor, label, labelWidth, x, left };
  });
  const active = labels.find(({ tick }) => tick.key === activeTick?.key);
  const activeLabelWidth = active
    ? Math.min(width - 32, active.tick.label.length * characterWidth)
    : 0;
  const activeX = active
    ? Math.max(
        16 + activeLabelWidth / 2,
        Math.min(width - 16 - activeLabelWidth / 2, active.x),
      )
    : 0;
  const activeLabel = active
    ? {
        ...active,
        active: true,
        label: active.tick.label,
        labelWidth: activeLabelWidth,
        x: activeX,
        left: activeX - activeLabelWidth / 2,
      }
    : undefined;
  const baseLabels = labels
    .sort((left, right) => {
      const leftEndpoint =
        left.index === 0 || left.index === axisTicks.length - 1;
      const rightEndpoint =
        right.index === 0 || right.index === axisTicks.length - 1;
      return Number(rightEndpoint) - Number(leftEndpoint);
    })
    .reduce<typeof labels>((visible, label) => {
      if (
        visible.some(
          (other) =>
            label.left < other.left + other.labelWidth + 8 &&
            label.left + label.labelWidth + 8 > other.left,
        )
      ) {
        return visible;
      }
      visible.push(label);
      return visible;
    }, []);
  // Keep the resting tick selection stable while hovering: only remove labels
  // that actually overlap the active label, without filling vacated slots.
  const visibleLabels = [
    ...baseLabels.filter(
      (label) =>
        !activeLabel ||
        (label.tick.key !== activeLabel.tick.key &&
          (label.left >= activeLabel.left + activeLabel.labelWidth + 8 ||
            label.left + label.labelWidth + 8 <= activeLabel.left)),
    ),
    ...(activeLabel ? [activeLabel] : []),
  ].sort((left, right) => left.index - right.index);
  return (
    <g>
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
        visibleLabels.map(({ tick, active, anchor, label, x, labelWidth }) => (
          <g key={tick.key}>
            <text
              data-x-axis-label=""
              data-active-x-axis-label={active ? "" : undefined}
              x={x}
              y={y + 16}
              textAnchor={active ? "middle" : anchor}
              textLength={
                active && tick.label.length * characterWidth > labelWidth
                  ? labelWidth
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
        ))}
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
  activeX,
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
    showCategoryTicks?: boolean;
    alignment?: "endpoints" | "center";
  };
  activeX?: { key: string; x: number; label: string };
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
      {activeX ? (
        <line
          data-active-reference-line=""
          x1={activeX.x}
          x2={activeX.x}
          y1={plot.top}
          y2={plot.top + plot.height}
          stroke="hsl(var(--foreground))"
          strokeDasharray="3 3"
          opacity={0.35}
          pointerEvents="none"
        />
      ) : null}
      {xAxis ? (
        <ChartXAxis
          ticks={xAxis.ticks}
          activeTick={activeX}
          y={plot.top + plot.height}
          width={width}
          showCategoryTicks={xAxis.showCategoryTicks}
          alignment={xAxis.alignment}
        />
      ) : null}
    </svg>
  );
}
