import * as React from "react";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { cn } from "@/src/utils/tailwind";

/**
 * Small hand-drawn chart sketches for widget pickers. Base strokes inherit
 * the muted foreground; the data series pops in the primary color so each
 * chart type reads at a glance.
 */
export function ChartTypeIllustration({
  type,
  className,
}: {
  type: DashboardWidgetChartType | "CUSTOM";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 72 48"
      fill="none"
      aria-hidden
      className={cn("text-muted-foreground/60", className)}
    >
      {illustrations[type] ?? illustrations.LINE_TIME_SERIES}
    </svg>
  );
}

const axis = (
  <path
    d="M8 6 V38 H66"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  />
);

const illustrations: Record<string, React.ReactNode> = {
  CUSTOM: (
    <>
      <rect
        x="6"
        y="6"
        width="60"
        height="36"
        rx="6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <path
        d="M36 17 V31 M29 24 H43"
        className="text-primary"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </>
  ),
  LINE_TIME_SERIES: (
    <>
      {axis}
      <path
        d="M12 32 L26 20 L38 26 L52 12 L64 18"
        className="text-primary"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  AREA_TIME_SERIES: (
    <>
      {axis}
      <path
        d="M12 32 L26 18 L40 24 L64 12 V38 H12 Z"
        className="text-primary"
        fill="currentColor"
        fillOpacity="0.2"
      />
      <path
        d="M12 32 L26 18 L40 24 L64 12"
        className="text-primary"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  BAR_TIME_SERIES: (
    <>
      {axis}
      {[
        [12, 26],
        [19, 20],
        [26, 28],
        [33, 16],
        [40, 22],
        [47, 12],
        [54, 18],
        [61, 8],
      ].map(([x, y]) => (
        <rect
          key={x}
          x={x}
          y={y}
          width="4.5"
          height={38 - (y as number)}
          rx="1.5"
          className="text-primary"
          fill="currentColor"
          fillOpacity="0.85"
        />
      ))}
    </>
  ),
  VERTICAL_BAR: (
    <>
      {axis}
      {[
        [14, 18],
        [25, 10],
        [36, 24],
        [47, 14],
        [58, 28],
      ].map(([x, y]) => (
        <rect
          key={x}
          x={x}
          y={y}
          width="7"
          height={38 - (y as number)}
          rx="2"
          className="text-primary"
          fill="currentColor"
          fillOpacity="0.85"
        />
      ))}
    </>
  ),
  HORIZONTAL_BAR: (
    <>
      <path
        d="M10 6 V42"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {[
        [8, 52],
        [17, 40],
        [26, 30],
        [35, 18],
      ].map(([y, w]) => (
        <rect
          key={y}
          x="12"
          y={y}
          width={w}
          height="6"
          rx="2"
          className="text-primary"
          fill="currentColor"
          fillOpacity="0.85"
        />
      ))}
    </>
  ),
  HISTOGRAM: (
    <>
      {axis}
      {[
        [12, 32],
        [19, 24],
        [26, 14],
        [33, 8],
        [40, 12],
        [47, 20],
        [54, 28],
        [61, 34],
      ].map(([x, y]) => (
        <rect
          key={x}
          x={x}
          y={y}
          width="7"
          height={38 - (y as number)}
          className="text-primary"
          fill="currentColor"
          fillOpacity="0.85"
        />
      ))}
    </>
  ),
  PIE: (
    <>
      <circle cx="36" cy="24" r="15" stroke="currentColor" strokeWidth="2" />
      <path
        d="M36 24 L36 9 A15 15 0 0 1 50.3 28.6 Z"
        className="text-primary"
        fill="currentColor"
        fillOpacity="0.85"
      />
    </>
  ),
  NUMBER: (
    <>
      <text
        x="36"
        y="28"
        textAnchor="middle"
        className="text-primary"
        fill="currentColor"
        fontSize="22"
        fontWeight="700"
        fontFamily="inherit"
      >
        128
      </text>
      <path
        d="M26 36 H46"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
  PIVOT_TABLE: (
    <>
      <rect
        x="10"
        y="8"
        width="52"
        height="32"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="10"
        y="8"
        width="52"
        height="9"
        rx="3"
        className="text-primary"
        fill="currentColor"
        fillOpacity="0.3"
      />
      <path
        d="M10 17 H62 M10 25 H62 M10 33 H62 M28 8 V40 M45 8 V40"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </>
  ),
};
