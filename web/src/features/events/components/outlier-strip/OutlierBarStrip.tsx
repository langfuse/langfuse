import { useMemo, useRef, useState } from "react";
import { cn } from "@/src/utils/tailwind";
import { X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Layer } from "@/src/components/ui/layer";
import {
  formatBucketRange,
  OUTLIER_STRIP_METRICS,
  type OutlierStripDenseBin,
  type OutlierStripMetricKey,
  type OutlierStripTick,
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
};

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
  /** Prepared gridline ticks ({@link prepareOutlierSeries}). */
  ticks: OutlierStripTick[];
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

export function OutlierBarStrip({
  dense,
  maxValue,
  stepMs,
  metric,
  widthPx,
  ticks,
  // Defaults locked by design review: sqrt scale keeps the base load
  // readable under 10-40x outliers; 50px height tuned 2026-07-28.
  heightPx = 50,
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
  // Touch model: taps and drags PREVIEW (pinned tooltip with an explicit
  // Explore action) instead of navigating — accidental touches must never
  // change the table's range. A tap previews one bucket, a drag previews the
  // selected span. Anchor is captured in viewport coords at the gesture;
  // `windowKey` pins the preview to the bucket grid it was captured on, so
  // any range/granularity change (drill-in, browser back/forward) invalidates
  // it by derivation — no effects.
  const [touchPreview, setTouchPreview] = useState<{
    fromMs: number;
    toMs: number;
    anchorX: number;
    anchorY: number;
    windowKey: string;
  } | null>(null);
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
  const labelHeight = showTimeLabels ? 13 : 0;
  const hasData = maxValue > 0;
  const hasActivity = dense.some((bin) => bin.count > 0);

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
    const barHeight = (value: number) => {
      // Corrupt data (e.g. end_time < start_time) must not NaN the height.
      const fraction = Math.max(value, 0) / maxValue;
      const scaled = scale === "sqrt" ? Math.sqrt(fraction) : fraction;
      return Math.max(1.5, scaled * plotHeight);
    };
    return (
      <>
        {/* Sparse vertical gridline ticks (Firefox-devtools style) */}
        {ticks.map((tick) => (
          <line
            key={`tick-${tick.index}`}
            x1={tick.index * slotPx}
            y1={0}
            x2={tick.index * slotPx}
            y2={plotHeight}
            className="stroke-foreground"
            strokeWidth={1}
            opacity={0.07}
          />
        ))}

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
          ticks.map((tick) => (
            <text
              key={`label-${tick.index}`}
              x={tick.index * slotPx + 3}
              y={heightPx + 9}
              className="fill-muted-foreground/80 font-mono"
              fontSize={9}
            >
              {tick.label}
            </text>
          ))}
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
    ticks,
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
  const windowKey = `${stepMs}:${dense[0]?.bucketStartMs ?? 0}:${dense.length}`;
  const activePreview =
    touchPreview && touchPreview.windowKey === windowKey ? touchPreview : null;
  // Aggregate stats over the previewed span (a tap's span is one bucket).
  const previewStats = activePreview
    ? dense.reduce(
        (acc, bin) => {
          if (
            bin.bucketStartMs >= activePreview.fromMs &&
            bin.bucketStartMs < activePreview.toMs
          ) {
            acc.count += bin.count;
            if (bin.value !== null) {
              acc.value =
                acc.value === null ? bin.value : Math.max(acc.value, bin.value);
            }
          }
          return acc;
        },
        { count: 0, value: null as number | null },
      )
    : null;
  const previewHasData =
    previewStats !== null &&
    (previewStats.count > 0 || previewStats.value !== null);

  return (
    <div className={cn("relative", className)} style={{ width: widthPx }}>
      <svg
        width={widthPx}
        height={heightPx + labelHeight}
        role="img"
        aria-label={`${metricSpec.shortLabel} per bucket`}
        className={cn(
          // pan-y: horizontal touch drags select a range; vertical stays with
          // the page scroll (LF-34 mobile gesture requirement). select-none +
          // the pointerdown preventDefault keep a range-drag from ALSO
          // starting a native text selection over the tick labels.
          "block touch-pan-y select-none",
          hoveredHasData || selection ? "cursor-pointer" : "cursor-default",
        )}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          setHoverIndex(null);
          setMouse(null);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 && event.pointerType === "mouse") return;
          // A drag must not double as a native text-selection drag.
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          dragRef.current = {
            startX: event.clientX - rect.left,
            dragging: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          if (event.pointerType === "mouse") {
            // Cursor hover: crosshair + follow-tooltip (touch never hovers —
            // its compat mouse events would pin a stale tooltip after taps).
            const index = Math.floor(x / slotPx);
            setHoverIndex(index >= 0 && index < dense.length ? index : null);
            setMouse({ x: event.clientX, y: event.clientY });
          }
          const drag = dragRef.current;
          if (!drag) return;
          if (!drag.dragging && Math.abs(x - drag.startX) < DRAG_THRESHOLD_PX) {
            return;
          }
          if (!drag.dragging) setTouchPreview(null);
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
            const range = spanToRange(drag.startX, x);
            if (event.pointerType !== "mouse") {
              // Touch: keep the selection band and offer an explicit Explore
              // instead of applying on release.
              setTouchPreview({
                ...range,
                anchorX: rect.left + (drag.startX + x) / 2,
                anchorY: rect.top,
                windowKey,
              });
              return;
            }
            // Mouse, Grafana-style: apply the dragged span to the range.
            onSelectionChange?.(null);
            setTouchPreview(null);
            onSelectBucket?.(range);
            return;
          }
          const index = Math.floor(x / slotPx);
          const bin = dense[index];
          if (!bin) return;
          if (event.pointerType !== "mouse") {
            // Touch tap = PREVIEW: pin the tooltip over the bucket; the
            // tooltip's Explore action performs the navigation. A leftover
            // drag band from a previous span preview clears — one preview,
            // one highlight.
            onSelectionChange?.(null);
            setTouchPreview({
              fromMs: bin.bucketStartMs,
              toMs: bin.bucketStartMs + stepMs,
              anchorX: rect.left + (index + 0.5) * slotPx,
              anchorY: rect.top,
              windowKey,
            });
            setHoverIndex(index);
            setMouse(null);
            return;
          }
          // Mouse click without movement drills into the bucket. Mirror the
          // tooltip's guard — a truly empty bucket would just drill the table
          // into a zero-row window.
          if ((bin.count > 0 || bin.value !== null) && onSelectBucket) {
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
            // Fill alone reads faint over sparse bars; crisp 1px edge lines
            // carry most of the band's perceived contrast (Grafana-style).
            return (
              <g>
                <rect
                  x={x}
                  y={0}
                  width={w}
                  height={plotHeight}
                  className="fill-foreground"
                  opacity={0.18}
                />
                <line
                  x1={x + 0.5}
                  y1={0}
                  x2={x + 0.5}
                  y2={plotHeight}
                  className="stroke-foreground"
                  strokeWidth={1}
                  opacity={0.55}
                />
                <line
                  x1={x + w - 0.5}
                  y1={0}
                  x2={x + w - 0.5}
                  y2={plotHeight}
                  className="stroke-foreground"
                  strokeWidth={1}
                  opacity={0.55}
                />
              </g>
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
      {hovered && mouse && !activePreview && (
        <Layer name="tooltip">
          <div
            className="bg-popover text-popover-foreground pointer-events-none fixed rounded border px-1.5 py-1 text-[11px] leading-tight whitespace-nowrap shadow-sm"
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

      {/* Touch preview — pinned above the tapped bucket or dragged span, with
          an explicit Explore action so an accidental touch never changes the
          range. */}
      {activePreview && previewStats && (
        <Layer name="tooltip">
          <div
            className="bg-popover text-popover-foreground fixed rounded border px-2 py-1.5 text-[11px] leading-tight whitespace-nowrap shadow-md"
            style={{
              left: Math.min(
                Math.max(activePreview.anchorX, 90),
                typeof window !== "undefined"
                  ? window.innerWidth - 90
                  : activePreview.anchorX,
              ),
              top: activePreview.anchorY - 6,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-muted-foreground">
                  {formatBucketRange(
                    activePreview.fromMs,
                    activePreview.toMs - activePreview.fromMs,
                  )}
                </div>
                <div className="font-bold">
                  {previewStats.value !== null
                    ? metricSpec.format(previewStats.value)
                    : previewStats.count > 0
                      ? "no data"
                      : metricSpec.format(0)}
                  <span className="text-muted-foreground ml-1.5 font-normal">
                    · {previewStats.count} events
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Dismiss preview"
                className="text-muted-foreground -mt-0.5 -mr-0.5 p-0.5"
                onClick={() => {
                  setTouchPreview(null);
                  setHoverIndex(null);
                  onSelectionChange?.(null);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {previewHasData && (
              <Button
                size="sm"
                className="mt-1.5 h-6 w-full text-[10px]"
                onClick={() => {
                  const range = {
                    fromMs: activePreview.fromMs,
                    toMs: activePreview.toMs,
                  };
                  setTouchPreview(null);
                  setHoverIndex(null);
                  onSelectionChange?.(null);
                  onSelectBucket?.(range);
                }}
              >
                Explore this window
              </Button>
            )}
          </div>
        </Layer>
      )}
    </div>
  );
}
