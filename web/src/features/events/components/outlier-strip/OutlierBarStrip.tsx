import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { cn } from "@/src/utils/tailwind";
import { Layer } from "@/src/components/ui/layer";
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
 * The strip always spans the full `widthPx` (fractional bar slots), with a
 * baseline and sparse vertical gridline ticks so the chart's boundaries stay
 * visible even where the range holds no data.
 */

const METRIC_COLOR: Record<OutlierStripMetricKey, string> = {
  cost: "hsl(var(--chart-1))",
  latency: "hsl(var(--chart-2))",
  tokens: "hsl(var(--chart-4))",
};

/** Minimum horizontal pixels between gridline ticks / labels. */
const TICK_MIN_SPACING_PX = 110;
/** Pointer travel before a press becomes a range-drag instead of a click. */
const DRAG_THRESHOLD_PX = 5;

export type OutlierBarStripProps = {
  dense: OutlierStripDenseBin[];
  /** Max metric value across buckets (0 = no data anywhere). */
  maxValue: number;
  stepMs: number;
  metric: OutlierStripMetricKey;
  /** Full plot width; bars stretch/shrink to span it exactly. */
  widthPx: number;
  /** Height of the bar canvas, labels excluded. */
  heightPx?: number;
  /**
   * Bar-height scale. Real cost/latency outliers are 10–40x the base load —
   * linear renders the base nearly invisible; sqrt (default) keeps it
   * readable while outliers still dominate.
   */
  scale?: "linear" | "sqrt";
  /** 1px baseline tick where events exist but carry no metric data. */
  showActivityTicks?: boolean;
  /** Sparse time labels under the gridline ticks. */
  showTimeLabels?: boolean;
  onSelectBucket?: (range: { fromMs: number; toMs: number }) => void;
  /** Transient drag selection (ms range), shared across sibling charts so a
   *  drag on one strip highlights on all (LF-34, Grafana-style). */
  selection?: { fromMs: number; toMs: number } | null;
  onSelectionChange?: (range: { fromMs: number; toMs: number } | null) => void;
  className?: string;
};

/**
 * Smallest "nice" tick step at least `minPx` wide at the current bar slot.
 * Ticks must be MULTIPLES of the bucket step — the grid tests
 * `bucketStartMs % tickStepMs === 0`, and a non-multiple would place ticks
 * irregularly (or never, for `1w` buckets whose starts aren't day-aligned).
 */
const pickTickStepMs = (
  stepMs: number,
  slotPx: number,
  minPx: number,
): number => {
  for (const step of OUTLIER_STRIP_STEP_LADDER_SECONDS) {
    const tickMs = step * 1000;
    if (tickMs % stepMs === 0 && (tickMs / stepMs) * slotPx >= minPx) {
      return tickMs;
    }
  }
  // Every k-th bucket, k sized to the pixel budget — aligned by construction.
  return Math.max(1, Math.ceil(minPx / slotPx)) * stepMs;
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
  widthPx,
  // Defaults locked by design review 2026-07-27: sqrt scale keeps the base
  // load readable under 10-40x outliers; 40px is the compact pick.
  heightPx = 40,
  scale = "sqrt",
  showActivityTicks = true,
  showTimeLabels = true,
  onSelectBucket,
  selection = null,
  onSelectionChange,
  className,
}: OutlierBarStripProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  // Drag gesture bookkeeping lives in a ref: pointermove during a drag only
  // updates the SHARED selection via onSelectionChange, never local state.
  const dragRef = useRef<{ startX: number; dragging: boolean } | null>(null);

  const metricSpec = OUTLIER_STRIP_METRICS[metric];
  const color = METRIC_COLOR[metric];
  const binCount = Math.max(dense.length, 1);
  // Fractional slots: the plot always spans the full width, so empty regions
  // read as "chart with no data here" instead of trailing whitespace.
  const slotPx = widthPx / binCount;
  // Exactly 1px between bars, square corners (design review 2026-07-27).
  const barWidth = Math.max(slotPx - 1, 0.5);
  // Bars sit ON the 1px baseline, never across it.
  const plotHeight = heightPx - 1;
  const labelHeight = showTimeLabels ? 12 : 0;
  const hasData = maxValue > 0;
  const hasActivity = dense.some((bin) => bin.count > 0);

  const tickStepMs = pickTickStepMs(stepMs, slotPx, TICK_MIN_SPACING_PX);

  // Maps a dragged pixel span to a bucket-snapped ms range.
  const spanToRange = (x1: number, x2: number) => {
    const clamp = (x: number) =>
      Math.min(Math.max(x, 0), Math.max(widthPx - 1, 0));
    const startIdx = Math.min(
      Math.floor(clamp(Math.min(x1, x2)) / slotPx),
      binCount - 1,
    );
    const endIdx = Math.min(
      Math.floor(clamp(Math.max(x1, x2)) / slotPx),
      binCount - 1,
    );
    const startMs = dense[startIdx]?.bucketStartMs ?? 0;
    const endMs = (dense[endIdx]?.bucketStartMs ?? 0) + stepMs;
    return { fromMs: startMs, toMs: endMs };
  };

  // The static plot (ticks, baseline, bars, labels) reconciles hundreds of
  // SVG nodes; memoized so cursor-follow tooltip renders (every mousemove)
  // only touch the crosshair + tooltip.
  const staticLayers = useMemo(() => {
    const tickLabel = (bucketMs: number) =>
      format(new Date(bucketMs), tickStepMs >= 86_400_000 ? "MMM d" : "HH:mm");
    const barHeight = (value: number) => {
      // Corrupt data (e.g. end_time < start_time) must not NaN the height.
      const fraction = Math.max(value, 0) / maxValue;
      const scaled = scale === "sqrt" ? Math.sqrt(fraction) : fraction;
      return Math.max(1.5, scaled * plotHeight);
    };
    return (
      <>
        {/* Sparse vertical gridline ticks (Firefox-devtools style) */}
        {dense.map((bin, i) => {
          if (bin.bucketStartMs % tickStepMs !== 0 || i === 0) return null;
          return (
            <line
              key={`tick-${i}`}
              x1={i * slotPx}
              y1={0}
              x2={i * slotPx}
              y2={plotHeight}
              className="stroke-foreground"
              strokeWidth={1}
              opacity={0.07}
            />
          );
        })}

        {/* Plot baseline: the chart's boundary stays visible without data */}
        <line
          x1={0}
          y1={heightPx - 0.5}
          x2={widthPx}
          y2={heightPx - 0.5}
          className="stroke-border"
          strokeWidth={1}
        />

        {/* Bars */}
        {dense.map((bin, i) => {
          if (bin.value === null) {
            // Events without metric data get a subtle activity tick so the
            // strip never reads "nothing happened" when data is merely absent.
            return showActivityTicks && bin.count > 0 ? (
              <rect
                key={i}
                x={i * slotPx}
                y={plotHeight - 1.5}
                width={barWidth}
                height={1.5}
                className="fill-muted-foreground"
                opacity={0.6}
              />
            ) : null;
          }
          const h = hasData ? barHeight(bin.value) : 0;
          return (
            <rect
              key={i}
              x={i * slotPx}
              y={plotHeight - h}
              width={barWidth}
              height={h}
              fill={color}
              opacity={0.8}
            />
          );
        })}

        {/* Sparse time labels on the tick grid */}
        {showTimeLabels &&
          dense.map((bin, i) => {
            if (bin.bucketStartMs % tickStepMs !== 0 || i === 0) return null;
            return (
              <text
                key={`label-${i}`}
                x={i * slotPx + 3}
                y={heightPx + 9}
                className="fill-muted-foreground/80 font-mono"
                fontSize={8}
              >
                {tickLabel(bin.bucketStartMs)}
              </text>
            );
          })}
      </>
    );
  }, [
    dense,
    slotPx,
    barWidth,
    heightPx,
    plotHeight,
    widthPx,
    color,
    tickStepMs,
    maxValue,
    scale,
    hasData,
    showActivityTicks,
    showTimeLabels,
  ]);

  // ?? null: a stale hoverIndex can outlive a shrinking dense array (data or
  // granularity change mid-hover), and undefined slips past a !== null check.
  const hovered = hoverIndex !== null ? (dense[hoverIndex] ?? null) : null;
  const hoveredHasData =
    hovered !== null && (hovered.count > 0 || hovered.value !== null);

  return (
    <div className={cn("relative", className)} style={{ width: widthPx }}>
      <svg
        width={widthPx}
        height={heightPx + labelHeight}
        role="img"
        aria-label={metricSpec.label}
        className={cn(
          // pan-y: horizontal touch drags select a range; vertical stays with
          // the page scroll (LF-34 mobile gesture requirement).
          "block touch-pan-y",
          hoveredHasData || selection ? "cursor-pointer" : "cursor-default",
        )}
        onMouseLeave={() => {
          setHoverIndex(null);
          setMouse(null);
        }}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const index = Math.floor((event.clientX - rect.left) / slotPx);
          setHoverIndex(index >= 0 && index < dense.length ? index : null);
          // Viewport coordinates: the tooltip portals to the overlay layer
          // and positions itself with `fixed`.
          setMouse({ x: event.clientX, y: event.clientY });
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 && event.pointerType === "mouse") return;
          const rect = event.currentTarget.getBoundingClientRect();
          dragRef.current = {
            startX: event.clientX - rect.left,
            dragging: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          if (!drag.dragging && Math.abs(x - drag.startX) < DRAG_THRESHOLD_PX) {
            return;
          }
          drag.dragging = true;
          onSelectionChange?.(spanToRange(drag.startX, x));
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (!drag) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          if (drag.dragging) {
            // Grafana-style: apply the dragged span to the global range.
            onSelectionChange?.(null);
            onSelectBucket?.(spanToRange(drag.startX, x));
            return;
          }
          // A press without movement is a click/tap: drill into one bucket.
          // Mirror the tooltip's guard — a truly empty bucket would just
          // drill the table into a zero-row window.
          const index = Math.floor(x / slotPx);
          const bin = dense[index];
          if (bin && (bin.count > 0 || bin.value !== null) && onSelectBucket) {
            onSelectBucket({
              fromMs: bin.bucketStartMs,
              toMs: bin.bucketStartMs + stepMs,
            });
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          onSelectionChange?.(null);
        }}
      >
        {staticLayers}

        {/* Shared drag-selection overlay (LF-34) */}
        {selection &&
          (() => {
            const first = dense[0]?.bucketStartMs;
            if (first === undefined) return null;
            const startX = ((selection.fromMs - first) / stepMs) * slotPx;
            const endX = ((selection.toMs - first) / stepMs) * slotPx;
            const x = Math.max(startX, 0);
            const w = Math.min(endX, widthPx) - x;
            if (w <= 0) return null;
            return (
              <rect
                x={x}
                y={0}
                width={w}
                height={plotHeight}
                className="fill-foreground"
                opacity={0.12}
              />
            );
          })()}

        {/* Hover crosshair column */}
        {hoverIndex !== null && (
          <rect
            x={hoverIndex * slotPx}
            y={0}
            width={slotPx}
            height={heightPx}
            className="fill-foreground"
            opacity={0.08}
          />
        )}
      </svg>

      {!hasData && (
        <span className="text-muted-foreground/70 pointer-events-none absolute inset-0 flex items-center justify-center text-[10px]">
          {hasActivity
            ? `No ${metricSpec.shortLabel.toLowerCase()} data in range`
            : "No events in range"}
        </span>
      )}

      {/* Tooltip — portals to the overlay tooltip layer so it can escape the
          band's ancestors (overflow clipping, sticky-toolbar stacking) and
          float freely at the cursor's top-right. */}
      {hovered && mouse && (
        <Layer name="tooltip">
          <div
            className="bg-popover text-popover-foreground pointer-events-none fixed rounded border px-1.5 py-1 font-mono text-[10px] leading-tight whitespace-nowrap shadow-sm"
            style={
              // Top-right of the cursor; flips to top-left near the viewport's
              // right edge so it never runs off screen.
              mouse.x + 200 > window.innerWidth
                ? {
                    left: mouse.x - 10,
                    top: mouse.y - 8,
                    transform: "translate(-100%, -100%)",
                  }
                : {
                    left: mouse.x + 10,
                    top: mouse.y - 8,
                    transform: "translateY(-100%)",
                  }
            }
          >
            <div className="text-muted-foreground">
              {formatBucketRange(hovered.bucketStartMs, stepMs)}
            </div>
            <div className="font-bold">
              {hovered.value !== null
                ? metricSpec.format(hovered.value)
                : hovered.count > 0
                  ? "no data"
                  : metricSpec.format(0)}
              <span className="text-muted-foreground ml-1.5 font-normal">
                · {hovered.count} events
              </span>
            </div>
          </div>
        </Layer>
      )}
    </div>
  );
}
