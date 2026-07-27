import { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/src/utils/tailwind";
import {
  OUTLIER_STRIP_METRICS,
  OUTLIER_STRIP_STEP_LADDER_SECONDS,
  type OutlierStripDenseBin,
  type OutlierStripMetricKey,
} from "./lib/binning";

/**
 * OutlierBarStrip — compact, Firefox-devtools-inspired bar strip (LFE-14451).
 * Pure visualiser: renders the dense series `prepareOutlierSeries` produced
 * and decides nothing about data. Every bar is the worst single event in its
 * time bucket; clicking a bar reports the bucket's range so the caller can
 * narrow the table's time window.
 *
 * Defaults reflect the picked design (sqrt scale, 5px slot, no bands, 40px);
 * the variant knobs remain for the Storybook matrices and future polish.
 */

const METRIC_COLOR: Record<OutlierStripMetricKey, string> = {
  cost: "hsl(var(--chart-1))",
  latency: "hsl(var(--chart-2))",
  tokens: "hsl(var(--chart-4))",
};

export type OutlierBarStripProps = {
  dense: OutlierStripDenseBin[];
  /** Max metric value across buckets (0 = no data anywhere). */
  maxValue: number;
  stepMs: number;
  metric: OutlierStripMetricKey;
  /** Height of the bar canvas, labels excluded. */
  heightPx?: number;
  /** Horizontal pixels one bar occupies, 1px gap included. */
  barSlotPx?: number;
  /** Scanability treatment: alternating time bands or value gridbands. */
  bands?: "none" | "time" | "value";
  /**
   * Bar-height scale. Real cost/latency outliers are 10–40x the base load —
   * linear renders the base nearly invisible; sqrt (default) keeps it
   * readable while outliers still dominate.
   */
  scale?: "linear" | "sqrt";
  /** 1px baseline tick where events exist but carry no metric data. */
  showActivityTicks?: boolean;
  /** Tiny max-value label in the top-left corner. */
  showMaxLabel?: boolean;
  /** Sparse time labels under the strip. */
  showTimeLabels?: boolean;
  onSelectBucket?: (range: { fromMs: number; toMs: number }) => void;
  className?: string;
};

/** Smallest ladder step spanning at least `minBars` bars — the band/label grid. */
const pickSuperStepMs = (stepMs: number, minBars: number): number => {
  for (const step of OUTLIER_STRIP_STEP_LADDER_SECONDS) {
    if (step * 1000 >= stepMs * minBars) return step * 1000;
  }
  const last =
    OUTLIER_STRIP_STEP_LADDER_SECONDS[
      OUTLIER_STRIP_STEP_LADDER_SECONDS.length - 1
    ] * 1000;
  return Math.ceil((stepMs * minBars) / last) * last;
};

const formatBucketRange = (fromMs: number, stepMs: number): string => {
  const from = new Date(fromMs);
  const to = new Date(fromMs + stepMs);
  const dayPattern = stepMs >= 86_400_000 ? "MMM d" : "MMM d, HH:mm:ss";
  return `${format(from, dayPattern)} – ${format(to, stepMs >= 86_400_000 ? "MMM d" : "HH:mm:ss")}`;
};

export function OutlierBarStrip({
  dense,
  maxValue,
  stepMs,
  metric,
  // Defaults locked by design review 2026-07-27: sqrt scale keeps the base
  // load readable under 10-40x outliers; 40px + no bands is the compact pick.
  heightPx = 40,
  barSlotPx = 5,
  bands = "none",
  scale = "sqrt",
  showActivityTicks = true,
  showMaxLabel = true,
  showTimeLabels = true,
  onSelectBucket,
  className,
}: OutlierBarStripProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const metricSpec = OUTLIER_STRIP_METRICS[metric];
  const color = METRIC_COLOR[metric];
  const width = dense.length * barSlotPx;
  const barWidth = Math.max(1, barSlotPx - 1);
  const labelHeight = showTimeLabels ? 14 : 0;
  const hasData = maxValue > 0;
  const hasActivity = dense.some((bin) => bin.count > 0);

  const superStepMs = pickSuperStepMs(stepMs, 8);
  const superIndex = (bucketMs: number) => Math.floor(bucketMs / superStepMs);
  const superLabel = (bucketMs: number) =>
    format(new Date(bucketMs), superStepMs >= 86_400_000 ? "MMM d" : "HH:mm");

  const barHeight = (value: number) => {
    if (!hasData) return 0;
    const fraction = value / maxValue;
    const scaled = scale === "sqrt" ? Math.sqrt(fraction) : fraction;
    return Math.max(1.5, scaled * heightPx);
  };

  const hovered = hoverIndex !== null ? dense[hoverIndex] : null;

  return (
    <div className={cn("relative", className)} style={{ width }}>
      {showMaxLabel && hasData && (
        <span className="text-muted-foreground pointer-events-none absolute top-0 left-0.5 z-[1] font-mono text-[9px] leading-none">
          {metricSpec.format(maxValue)}
        </span>
      )}

      <svg
        width={width}
        height={heightPx + labelHeight}
        role="img"
        aria-label={metricSpec.label}
        className="block cursor-crosshair"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const index = Math.floor((event.clientX - rect.left) / barSlotPx);
          setHoverIndex(index >= 0 && index < dense.length ? index : null);
        }}
        onClick={() => {
          if (hovered && onSelectBucket) {
            onSelectBucket({
              fromMs: hovered.bucketStartMs,
              toMs: hovered.bucketStartMs + stepMs,
            });
          }
        }}
      >
        {/* Scan bands */}
        {bands === "time" &&
          dense.map((bin, i) =>
            superIndex(bin.bucketStartMs) % 2 === 1 ? (
              <rect
                key={`band-${i}`}
                x={i * barSlotPx}
                y={0}
                width={barSlotPx}
                height={heightPx}
                className="fill-muted"
                opacity={0.5}
              />
            ) : null,
          )}
        {bands === "value" &&
          [0.25, 0.75].map((fraction) => (
            <rect
              key={fraction}
              x={0}
              y={heightPx * (1 - fraction - 0.25)}
              width={width}
              height={heightPx * 0.25}
              className="fill-muted"
              opacity={0.4}
            />
          ))}

        {/* Bars */}
        {dense.map((bin, i) => {
          if (bin.value === null) {
            // Events without metric data get a subtle activity tick so the
            // strip never reads "nothing happened" when data is merely absent.
            return showActivityTicks && bin.count > 0 ? (
              <rect
                key={i}
                x={i * barSlotPx}
                y={heightPx - 1}
                width={barWidth}
                height={1}
                className="fill-muted-foreground"
                opacity={0.6}
              />
            ) : null;
          }
          const h = barHeight(bin.value);
          return (
            <rect
              key={i}
              x={i * barSlotPx}
              y={heightPx - h}
              width={barWidth}
              height={h}
              rx={barSlotPx >= 5 ? 1 : 0}
              fill={color}
              opacity={hoverIndex === i ? 1 : 0.75}
            />
          );
        })}

        {/* Hover crosshair column */}
        {hoverIndex !== null && (
          <rect
            x={hoverIndex * barSlotPx}
            y={0}
            width={barSlotPx}
            height={heightPx}
            className="fill-foreground"
            opacity={0.08}
          />
        )}

        {/* Sparse time labels on the super-step grid */}
        {showTimeLabels &&
          dense.map((bin, i) => {
            if (bin.bucketStartMs % superStepMs !== 0 || i === 0) return null;
            return (
              <text
                key={`label-${i}`}
                x={i * barSlotPx + 1}
                y={heightPx + 10}
                className="fill-muted-foreground font-mono"
                fontSize={8}
              >
                {superLabel(bin.bucketStartMs)}
              </text>
            );
          })}
      </svg>

      {!hasData && (
        <span className="text-muted-foreground/70 pointer-events-none absolute inset-0 flex items-center justify-center text-[10px]">
          {hasActivity
            ? `No ${metricSpec.shortLabel.toLowerCase()} data in range`
            : "No events in range"}
        </span>
      )}

      {/* Tooltip */}
      {hovered && (hovered.count > 0 || hovered.value !== null) && (
        <div
          className="bg-popover text-popover-foreground pointer-events-none absolute z-10 rounded border px-1.5 py-1 font-mono text-[10px] leading-tight shadow-sm"
          style={{
            left: Math.min(
              (hoverIndex ?? 0) * barSlotPx + barSlotPx + 4,
              Math.max(0, width - 150),
            ),
            top: 0,
          }}
        >
          <div className="text-muted-foreground">
            {formatBucketRange(hovered.bucketStartMs, stepMs)}
          </div>
          <div className="font-bold">
            {hovered.value !== null
              ? metricSpec.format(hovered.value)
              : "no data"}
            <span className="text-muted-foreground ml-1.5 font-normal">
              · {hovered.count} events
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
