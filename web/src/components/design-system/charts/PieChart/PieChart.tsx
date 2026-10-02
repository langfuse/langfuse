"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { scaleOrdinal } from "d3-scale";
import { arc, pie, type PieArcDatum } from "d3-shape";

import { ChartContainer } from "@/src/components/design-system/internal/charts/ChartContainer";
import { ChartTooltip } from "@/src/components/design-system/internal/charts/ChartTooltip";
import { useElementSize } from "@/src/hooks/useElementSize";
import {
  chartColors,
  INACTIVE_CHART_COLOR_STRENGTH,
  CHART_TRANSITION_DURATION,
} from "@/src/components/design-system/charts/constants";

export type PieChartDatum = {
  label: string;
  value: number;
};

type PieChartSliceDatum = PieChartDatum & {
  id: string;
  details?: PieChartDatum[];
};

type PieChartProps = {
  data: PieChartDatum[];
  valueFormatter?: (value: number) => string;
  centerLabel?: string;
  ariaLabel?: string;
};

const VIEWBOX_SIZE = 280;
const CENTER = VIEWBOX_SIZE / 2;
const INNER_RADIUS = VIEWBOX_SIZE * (2 / 7);
const OUTER_RADIUS = VIEWBOX_SIZE * (3 / 7);
const ACTIVE_OUTER_RADIUS = VIEWBOX_SIZE * (13 / 28);
const SMALL_SLICE_THRESHOLD = 0.02;
const PAD_ANGLE = (2 * Math.PI) / 360;
const MIN_VISIBLE_ANGLE = 2 * Math.PI * 0.01;
const MIN_SLICE_ANGLE = PAD_ANGLE + MIN_VISIBLE_ANGLE;
const MIN_CENTER_LABEL_CHART_SIZE = 160;
const CENTER_LABEL_SIZES = [
  "2xlarge",
  "xlarge",
  "large",
  "medium",
  "small",
] as const;
const percentageFormatter = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
});

export function PieChart({ ...props }: PieChartProps) {
  return (
    <ChartContainer>
      {({ width, height }) => (
        <PieChartContent {...props} availableSize={Math.min(width, height)} />
      )}
    </ChartContainer>
  );
}

function PieChartContent({
  data,
  valueFormatter = (value) => value.toLocaleString(),
  centerLabel = "Total",
  ariaLabel = "Pie chart",
  availableSize,
}: PieChartProps & { availableSize: number }) {
  const totalValue = useMemo(
    () =>
      data.reduce(
        (total, datum) =>
          Number.isFinite(datum.value) && datum.value > 0
            ? total + datum.value
            : total,
        0,
      ),
    [data],
  );
  const chartSlices = useMemo(() => {
    const validData: PieChartSliceDatum[] = data.flatMap((datum, index) => {
      if (!Number.isFinite(datum.value) || datum.value <= 0) return [];

      return [{ ...datum, id: `datum-${index}`, details: undefined }];
    });
    const smallData = validData.filter(
      (datum) => datum.value / totalValue < SMALL_SLICE_THRESHOLD,
    );
    const chartData = validData.filter(
      (datum) => datum.value / totalValue >= SMALL_SLICE_THRESHOLD,
    );

    if (smallData.length > 0) {
      chartData.push({
        id: "combined-small-slices",
        label: "Other",
        value: smallData.reduce((total, datum) => total + datum.value, 0),
        details: smallData,
      });
    }

    const slicesNeedingMinimumAngle = chartData.filter(
      (datum) => (datum.value / totalValue) * 2 * Math.PI < MIN_SLICE_ANGLE,
    );
    const flexibleValue = chartData.reduce(
      (total, datum) =>
        slicesNeedingMinimumAngle.includes(datum) ? total : total + datum.value,
      0,
    );
    const flexibleAngle =
      2 * Math.PI - slicesNeedingMinimumAngle.length * MIN_SLICE_ANGLE;
    const colorScale = scaleOrdinal(
      chartData.map((datum) => datum.id),
      chartColors,
    );

    return pie<(typeof chartData)[number]>()
      .value((datum) => {
        if (slicesNeedingMinimumAngle.includes(datum)) return MIN_SLICE_ANGLE;
        if (flexibleValue === 0) return (2 * Math.PI) / chartData.length;
        return (datum.value / flexibleValue) * flexibleAngle;
      })
      .sort(null)
      .padAngle(PAD_ANGLE)(chartData)
      .flatMap((slice, index) => {
        const path = arc<PieArcDatum<(typeof chartData)[number]>>()
          .innerRadius(INNER_RADIUS)
          .outerRadius(OUTER_RADIUS)
          .cornerRadius(1)(slice);
        const activePath = arc<PieArcDatum<(typeof chartData)[number]>>()
          .innerRadius(INNER_RADIUS)
          .outerRadius(ACTIVE_OUTER_RADIUS)
          .cornerRadius(1)(slice);
        if (!path || !activePath) return [];

        return [
          {
            slice,
            index,
            path,
            activePath,
            color: colorScale(slice.data.id),
          },
        ];
      });
  }, [data, totalValue]);

  const centerLabelSize = useMemo(() => {
    if (availableSize >= 420) return "2xlarge";
    if (availableSize >= 320) return "xlarge";
    if (availableSize >= 240) return "large";
    if (availableSize >= 160) return "medium";
    return "small";
  }, [availableSize]);

  const [centerTextRef, centerTextSize] = useElementSize<HTMLDivElement>();
  const formattedTotal = valueFormatter(totalValue);
  const [centerTextFit, setCenterTextFit] = useState<{
    availableSize: number;
    centerLabel: string;
    formattedTotal: string;
    size: typeof centerLabelSize | "hidden";
  } | null>(null);
  const fittedCenterLabelSize =
    centerTextFit?.availableSize === availableSize &&
    centerTextFit.centerLabel === centerLabel &&
    centerTextFit.formattedTotal === formattedTotal
      ? centerTextFit.size
      : centerLabelSize;

  useLayoutEffect(() => {
    const element = centerTextRef.current;
    if (!element) return;
    if (fittedCenterLabelSize === "hidden") return;

    const radius = ((availableSize * INNER_RADIUS) / VIEWBOX_SIZE) * 0.9;
    // The rectangle's corners must fit the circular hole, not just its width.
    const textRadius =
      Math.hypot(element.offsetWidth, element.offsetHeight) / 2;
    if (textRadius <= radius) return;

    const nextSize =
      CENTER_LABEL_SIZES[
        CENTER_LABEL_SIZES.indexOf(fittedCenterLabelSize) + 1
      ] ?? "hidden";

    setCenterTextFit((current) => {
      if (
        current?.availableSize === availableSize &&
        current.centerLabel === centerLabel &&
        current.formattedTotal === formattedTotal &&
        current.size === nextSize
      ) {
        return current;
      }
      return { availableSize, centerLabel, formattedTotal, size: nextSize };
    });
  }, [
    availableSize,
    fittedCenterLabelSize,
    centerLabel,
    formattedTotal,
    centerTextRef,
    centerTextSize?.width,
    centerTextSize?.height,
  ]);

  return (
    <ChartTooltip>
      {({ activeIndex, getReferenceProps }) => (
        <>
          <svg
            viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
            className="absolute inset-0 h-full min-h-0 w-full min-w-0 overflow-visible"
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label={ariaLabel}
          >
            <g transform={`translate(${CENTER}, ${CENTER})`}>
              {chartSlices.length === 0 ? (
                <circle
                  r={(INNER_RADIUS + OUTER_RADIUS) / 2}
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth={OUTER_RADIUS - INNER_RADIUS}
                  aria-hidden="true"
                />
              ) : null}
              {chartSlices.map(({ slice, index, path, activePath, color }) => {
                const isActive = activeIndex === index;

                const fill =
                  activeIndex !== undefined && !isActive
                    ? `color-mix(in srgb, ${color} ${INACTIVE_CHART_COLOR_STRENGTH}%, hsl(var(--background)))`
                    : color;

                return (
                  <path
                    key={slice.data.id}
                    d={isActive ? activePath : path}
                    fill={fill}
                    stroke="hsl(var(--background))"
                    strokeWidth={isActive ? 4 : 3}
                    className="outline-hidden transition-[fill] focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      transitionDuration: CHART_TRANSITION_DURATION,
                    }}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${slice.data.label}: ${valueFormatter(slice.data.value)}`}
                    {...getReferenceProps({
                      type: "primary",
                      index,
                      anchor: { type: "pointer" },
                      label: slice.data.label,
                      value: `${valueFormatter(slice.data.value)} (${percentageFormatter.format(slice.data.value / totalValue)})`,
                      color,
                      copyLabel: slice.data.label,
                      hint: "Click or press Enter to copy label",
                      details: slice.data.details?.map((datum) => ({
                        label: datum.label,
                        value: `${valueFormatter(datum.value)} (${percentageFormatter.format(datum.value / totalValue)})`,
                      })),
                    })}
                  />
                );
              })}
            </g>
          </svg>

          <div
            className={clsx(
              "pointer-events-none absolute inset-0 flex items-center justify-center",
              availableSize < MIN_CENTER_LABEL_CHART_SIZE && "invisible",
              fittedCenterLabelSize === "hidden" && "invisible",
            )}
            aria-hidden="true"
          >
            <div
              ref={centerTextRef}
              className={clsx(
                "flex shrink-0 flex-col items-center justify-center whitespace-nowrap",
                fittedCenterLabelSize === "2xlarge" && "gap-2",
                fittedCenterLabelSize === "xlarge" && "gap-1.5",
                fittedCenterLabelSize === "large" && "gap-1",
                fittedCenterLabelSize === "medium" && "gap-0.5",
              )}
            >
              <span
                className={clsx(
                  "text-foreground leading-none font-bold",
                  fittedCenterLabelSize === "2xlarge" && "text-6xl",
                  fittedCenterLabelSize === "xlarge" && "text-5xl",
                  fittedCenterLabelSize === "large" && "text-3xl",
                  fittedCenterLabelSize === "medium" && "text-xl",
                  fittedCenterLabelSize === "small" && "text-sm",
                )}
              >
                {formattedTotal}
              </span>
              <span
                className={clsx(
                  "text-muted-foreground leading-none",
                  fittedCenterLabelSize === "2xlarge" && "text-lg",
                  fittedCenterLabelSize === "xlarge" && "text-base",
                  fittedCenterLabelSize === "large" && "text-xs",
                  fittedCenterLabelSize === "medium" && "text-[10px]",
                  fittedCenterLabelSize === "small" && "text-[8px]",
                )}
              >
                {centerLabel}
              </span>
            </div>
          </div>
        </>
      )}
    </ChartTooltip>
  );
}
