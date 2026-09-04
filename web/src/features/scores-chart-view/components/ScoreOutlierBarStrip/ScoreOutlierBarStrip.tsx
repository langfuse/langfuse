import { useCallback, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Layer } from "@/src/components/ui/layer";
import { formatBucketRange } from "@/src/features/events/components/outlier-strip/lib/binning";
import { SCORE_OUTLIER_STRIP_METRICS } from "@/src/features/scores-chart-view/constants/scoreOutlierStripMetrics";
import { prepareScoreOutlierYTicks } from "@/src/features/scores-chart-view/fns/binning/scoreOutlierBinning";
import {
  type ScoreOutlierDenseBin,
  type ScoreOutlierMetricKey,
  type ScoreOutlierTick,
} from "@/src/features/scores-chart-view/types";

/**
 * ScoreOutlierBarStrip — the scores-table analogue of the observations
 * strip's `OutlierBarStrip` (`@/src/features/events/components/outlier-strip`):
 * a compact, Firefox-devtools-inspired bar strip. Pure visualiser — renders
 * the dense series `prepareScoreOutlierSeries` produced and decides nothing
 * about data. Each bar is a prepared aggregate for its time bucket; clicking
 * it reports the bucket's range so the caller can narrow the table's time
 * window.
 */

/** Pointer travel before a press becomes a range-drag instead of a click. */
const DRAG_THRESHOLD_PX = 5;

/** Which gesture drove a drill-in — carried to the caller for analytics. */
export type ScoreOutlierStripDrillTrigger =
  | "bucket_click"
  | "drag_span"
  | "touch_explore";

export type ScoreOutlierBarStripProps = {
  dense: ScoreOutlierDenseBin[];
  /** Max metric value across buckets (0 = no data anywhere). */
  maxValue: number;
  stepMs: number;
  metric: ScoreOutlierMetricKey;
  /** Full plot width; bars stretch/shrink to span it exactly. */
  widthPx: number;
  /** Prepared gridline ticks (`prepareScoreOutlierSeries`). */
  ticks: ScoreOutlierTick[];
  /** Height of the bar canvas, labels excluded. */
  heightPx?: number;
  /** Bar-height scale; sqrt (default) keeps a low base load readable next to
   *  a handful of outlier buckets. */
  scale?: "linear" | "sqrt";
  /** 1px baseline tick where scores exist but carry no metric data. */
  showActivityTicks?: boolean;
  /** Sparse time labels under the gridline ticks. */
  showTimeLabels?: boolean;
  onSelectBucket?: (
    range: { fromMs: number; toMs: number },
    meta: { trigger: ScoreOutlierStripDrillTrigger },
  ) => void;
  /** Touch preview pinned (tap or drag release) — the analytics seam for the
   *  preview → explore funnel; never fired for mouse interactions. */
  onPreviewPinned?: (trigger: "tap" | "drag") => void;
  /** Transient drag selection (ms range). */
  selection?: { fromMs: number; toMs: number } | null;
  onSelectionChange?: (range: { fromMs: number; toMs: number } | null) => void;
  /** Why the chart cannot represent the current table state. */
  disabledReason?: string;
};

export function ScoreOutlierBarStrip({
  dense,
  maxValue,
  stepMs,
  metric,
  widthPx,
  ticks,
  heightPx = 50,
  scale = "sqrt",
  showActivityTicks = true,
  showTimeLabels = true,
  onSelectBucket,
  onPreviewPinned,
  selection = null,
  onSelectionChange,
  disabledReason,
}: ScoreOutlierBarStripProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  // Touch model: taps and drags PREVIEW (pinned tooltip with an explicit
  // Explore action) instead of navigating — accidental touches must never
  // change the table's range.
  const [touchPreview, setTouchPreview] = useState<{
    fromMs: number;
    toMs: number;
    anchorX: number;
    anchorY: number;
    windowKey: string;
  } | null>(null);
  const dragRef = useRef<{ startX: number; dragging: boolean } | null>(null);
  const [previewSize, setPreviewSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const previewResizeObserverRef = useRef<ResizeObserver | null>(null);
  const measurePreview = useCallback((el: HTMLDivElement | null) => {
    previewResizeObserverRef.current?.disconnect();
    previewResizeObserverRef.current = null;
    if (!el) {
      setPreviewSize(null);
      return;
    }
    const measure = () =>
      setPreviewSize((prev) => {
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        return prev && prev.width === width && prev.height === height
          ? prev
          : { width, height };
      });
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      previewResizeObserverRef.current = observer;
    }
  }, []);

  const metricSpec = SCORE_OUTLIER_STRIP_METRICS[metric];
  const color = metricSpec.color;
  const binCount = Math.max(dense.length, 1);
  const slotPx = widthPx / binCount;
  const barWidth = Math.max(slotPx - 1, 0.5);
  const plotHeight = heightPx - 1;
  const labelHeight = showTimeLabels ? 13 : 0;
  const hasData = maxValue > 0;
  const hasActivity = dense.some((bin) => bin.count > 0);

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

  const staticLayers = useMemo(() => {
    const barHeight = (value: number) => {
      const fraction = Math.max(value, 0) / maxValue;
      const scaled = scale === "sqrt" ? Math.sqrt(fraction) : fraction;
      return Math.max(1.5, scaled * plotHeight);
    };
    const yTicks = prepareScoreOutlierYTicks({
      maxValue,
      metric,
      plotHeightPx: plotHeight,
      scale,
    });
    return (
      <>
        {yTicks.map((tick) => (
          <line
            key={`y-tick-${tick.value}`}
            x1={0}
            y1={plotHeight - tick.offsetPx}
            x2={widthPx}
            y2={plotHeight - tick.offsetPx}
            className="stroke-foreground"
            strokeWidth={1}
            opacity={0.07}
          />
        ))}

        <line
          x1={0}
          y1={heightPx - 0.5}
          x2={widthPx}
          y2={heightPx - 0.5}
          className="stroke-border"
          strokeWidth={1}
        />

        {dense.map((bin, i) => {
          if (bin.value === null) {
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

        {showTimeLabels &&
          ticks.map((tick) => (
            <text
              key={`label-${tick.index}`}
              x={tick.index * slotPx + 3}
              y={heightPx + 9}
              className="fill-muted-foreground/80 font-sans"
              fontSize={9}
            >
              {tick.label}
            </text>
          ))}

        {yTicks.map((tick) => {
          const lineY = plotHeight - tick.offsetPx;
          return (
            <text
              key={`y-label-${tick.value}`}
              x={3}
              y={lineY + 9}
              textAnchor="start"
              className="fill-muted-foreground stroke-background font-sans"
              fontSize={9}
              strokeWidth={2.5}
              style={{ paintOrder: "stroke" }}
            >
              {tick.label}
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
    ticks,
    maxValue,
    metric,
    scale,
    hasData,
    showActivityTicks,
    showTimeLabels,
  ]);

  const hovered = hoverIndex !== null ? (dense[hoverIndex] ?? null) : null;
  const windowKey = `${stepMs}:${dense[0]?.bucketStartMs ?? 0}:${dense.length}`;
  const activePreview =
    touchPreview && touchPreview.windowKey === windowKey ? touchPreview : null;
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
  const previewHalfWidth = (previewSize?.width ?? 0) / 2;
  const viewportWidth =
    typeof window !== "undefined" ? window.innerWidth : Number.MAX_SAFE_INTEGER;

  if (disabledReason) {
    return (
      <div
        className="text-muted-foreground bg-muted/30 mt-1.5 flex items-center justify-center rounded text-[11px]"
        style={{ width: widthPx, height: heightPx + labelHeight }}
        aria-disabled="true"
      >
        {disabledReason}
      </div>
    );
  }

  return (
    <div className="relative mt-1.5" style={{ width: widthPx }}>
      <svg
        width={widthPx}
        height={heightPx + labelHeight}
        role="img"
        aria-label={`${metricSpec.shortLabel} per bucket`}
        className="block cursor-crosshair touch-pan-y select-none"
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          setHoverIndex(null);
          setMouse(null);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 && event.pointerType === "mouse") return;
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
              setTouchPreview({
                ...range,
                anchorX: rect.left + (drag.startX + x) / 2,
                anchorY: rect.top,
                windowKey,
              });
              onPreviewPinned?.("drag");
              return;
            }
            onSelectionChange?.(null);
            setTouchPreview(null);
            onSelectBucket?.(range, { trigger: "drag_span" });
            return;
          }
          const index = Math.floor(x / slotPx);
          const bin = dense[index];
          if (!bin) return;
          if (event.pointerType !== "mouse") {
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
            onPreviewPinned?.("tap");
            return;
          }
          if ((bin.count > 0 || bin.value !== null) && onSelectBucket) {
            onSelectBucket(
              {
                fromMs: bin.bucketStartMs,
                toMs: bin.bucketStartMs + stepMs,
              },
              { trigger: "bucket_click" },
            );
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          onSelectionChange?.(null);
        }}
      >
        {staticLayers}

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
        <span
          className="text-muted-foreground/70 pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center text-[10px]"
          style={{ height: heightPx }}
        >
          {hasActivity
            ? `No ${metricSpec.shortLabel.toLowerCase()} data in range`
            : "No scores in range"}
        </span>
      )}

      {hovered && mouse && !activePreview && (
        <Layer name="tooltip">
          <div
            className="bg-popover text-popover-foreground pointer-events-none fixed rounded border px-1.5 py-1 text-[11px] leading-tight whitespace-nowrap shadow-sm"
            style={
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
              {/* No "· N scores" suffix here in Value mode: `hovered.count` is
                  the every-listable-type total (from the count-only query),
                  while the value itself only ever reflects NUMERIC/Boolean
                  rows (from a separate query) — showing them together would
                  misleadingly imply the value was computed over that count. */}
            </div>
          </div>
        </Layer>
      )}

      {activePreview && previewStats && (
        <Layer name="tooltip">
          <div
            key={`${activePreview.fromMs}:${activePreview.toMs}`}
            ref={measurePreview}
            className="bg-popover text-popover-foreground fixed max-w-[calc(100vw-16px)] rounded border px-2 py-1.5 text-[11px] leading-tight whitespace-nowrap shadow-md"
            style={{
              left: Math.min(
                Math.max(activePreview.anchorX, 8 + previewHalfWidth),
                Math.max(
                  viewportWidth - 8 - previewHalfWidth,
                  8 + previewHalfWidth,
                ),
              ),
              top: Math.max(
                activePreview.anchorY - 6,
                (previewSize?.height ?? 0) + 8,
              ),
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
                  {/* Count mode: `previewStats.count` is the span's correctly
                      summed total; `previewStats.value` below is instead the
                      max of per-bucket counts (a "busiest bucket" reduce that
                      only fits avg/max, not a sum), so it's used only for the
                      other metric/aggregations, not Count. */}
                  {metric === "count"
                    ? metricSpec.format(previewStats.count)
                    : previewStats.value !== null
                      ? metricSpec.format(previewStats.value)
                      : previewStats.count > 0
                        ? "no data"
                        : metricSpec.format(0)}
                  {/* Same omission as the hover tooltip above — see its comment. */}
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
                  onSelectBucket?.(range, { trigger: "touch_explore" });
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
