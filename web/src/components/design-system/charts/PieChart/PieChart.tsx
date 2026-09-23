"use client";

import { useMemo } from "react";
import { scaleOrdinal } from "d3-scale";
import { arc, pie, type PieArcDatum } from "d3-shape";

import { ChartContainer } from "@/src/components/design-system/charts/ChartContainer";
import { ChartTooltip } from "@/src/components/design-system/internal/charts/ChartTooltip";
import { chartColors } from "@/src/components/design-system/charts/chartColors";
import { cn } from "@/src/utils/tailwind";

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
  variant?: "default" | "subtle";
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
  variant = "default",
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

                let opacity = 0.82;
                if (variant === "subtle") opacity = isActive ? 0.9 : 0.45;
                if (isActive && variant === "default") opacity = 1;

                return (
                  <path
                    key={slice.data.id}
                    d={isActive ? activePath : path}
                    fill={color}
                    opacity={opacity}
                    stroke="hsl(var(--background))"
                    strokeWidth={isActive ? 4 : 3}
                    className="outline-hidden transition-[opacity] duration-100 focus-visible:outline-2 focus-visible:outline-offset-2"
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${slice.data.label}: ${valueFormatter(slice.data.value)}`}
                    {...getReferenceProps({
                      type: "primary",
                      index,
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
            className={cn(
              "pointer-events-none absolute inset-0 flex flex-col items-center justify-center",
              centerLabelSize === "2xlarge" && "gap-2",
              centerLabelSize === "xlarge" && "gap-1.5",
              centerLabelSize === "large" && "gap-1",
              centerLabelSize === "medium" && "gap-0.5",
            )}
            aria-hidden="true"
          >
            <span
              className={cn(
                "text-foreground leading-none font-bold",
                centerLabelSize === "2xlarge" && "text-6xl",
                centerLabelSize === "xlarge" && "text-5xl",
                centerLabelSize === "large" && "text-3xl",
                centerLabelSize === "medium" && "text-xl",
                centerLabelSize === "small" && "text-sm",
              )}
            >
              {valueFormatter(totalValue)}
            </span>
            <span
              className={cn(
                "text-muted-foreground leading-none",
                centerLabelSize === "2xlarge" && "text-lg",
                centerLabelSize === "xlarge" && "text-base",
                centerLabelSize === "large" && "text-xs",
                centerLabelSize === "medium" && "text-[10px]",
                centerLabelSize === "small" && "text-[8px]",
              )}
            >
              {centerLabel}
            </span>
          </div>
        </>
      )}
    </ChartTooltip>
  );
}
