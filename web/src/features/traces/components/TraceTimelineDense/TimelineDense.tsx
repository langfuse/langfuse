/**
 * Throwaway renderer for the extreme-density spike.
 *
 * The question it exists to answer: in a narrow, tall layout, does killing the
 * names and the text and spending every pixel on shape make you FEEL the
 * timeline — where a 26px row with a duration label next to a 4px bar reads as
 * a list of numbers instead?
 *
 * The moves, all of them reversals of the comfortable layout:
 *  - No name gutter. A 10px colour rail carries type (and, by indent, roughly
 *    depth); everything else is time.
 *  - Row height shrinks to fit the box, down to a 4px hairline. Nothing scrolls
 *    in either axis until the trace is taller than the box even at 4px.
 *  - No text at hairline density. Hover (or tap) names what you are on in a
 *    tooltip instead, and the row under the pointer lights up.
 *  - The surface owns the zoom gestures: trackpad pinch and wheel narrow the
 *    time window about the cursor, drag pans it, double-click refits. When the
 *    rows fit, a plain wheel zooms — there is no vertical scroll to spend it on.
 *
 * A magnifying lens (rows near the pointer expanding, borrowing space from the
 * rest) is implemented and tested in verticalFit.ts, and is deliberately NOT the
 * default: a fisheye needs an INVERTIBLE transform to hit-test correctly, and
 * absolutely-positioned rows are the wrong substrate for that. See the
 * `LensExperiment` story and the findings doc — it wants its own spike on a
 * canvas/WebGL surface.
 *
 * Not production code. See fns/timeline/verticalFit.ts for the pure half.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/src/utils/tailwind";
import { type Density } from "../../fns/timeline/density";
import {
  formatDurationMs,
  layout,
  prepareTimeline,
  timeCompressionFor,
  type LayoutNode,
} from "../../fns/timeline/layout";
import { createTextMeasurer } from "../../fns/timeline/textMeasurer";
import {
  applyFocusLens,
  resolveVerticalFit,
  rowIndexAtY,
} from "../../fns/timeline/verticalFit";
import {
  fitView,
  isFitted,
  panView,
  traceSpaceOf,
  zoomView,
  type Box,
  type TimeSpan,
} from "../../fns/timeline/viewTransform";

/** Reuses ItemBadge's type→hue mapping, so a colour means what it already means. */
const TYPE_COLOR: Record<string, string> = {
  TRACE: "bg-dark-green",
  GENERATION: "bg-muted-magenta",
  EVENT: "bg-muted-green",
  SPAN: "bg-muted-blue",
  AGENT: "bg-purple-600",
  TOOL: "bg-orange-600",
  CHAIN: "bg-pink-600",
  RETRIEVER: "bg-teal-600",
  EMBEDDING: "bg-amber-600",
  GUARDRAIL: "bg-red-600",
};
const FALLBACK_COLOR = "bg-muted-gray";

const RAIL_WIDTH = 10;
const RAIL_INDENT = 2;
const RAIL_MAX_DEPTH = 4;
const AXIS_HEIGHT = 16;
const READOUT_HEIGHT = 18;
const FRAME_BORDER = 1;
/** How far the lens reaches, in rows, and how much it magnifies the centre. */
const LENS_RADIUS_ROWS = 10;
const LENS_MAGNIFICATION = 9;
const ZOOM_STEP = 1.15;
const DRAG_THRESHOLD_PX = 4;

export type TimelineDenseProps = {
  roots: LayoutNode[];
  /** The measured box. Required — there is no fallback size. */
  box: Box;
  /** Names are hidden by default: that is the whole point of this layout. */
  showNames: boolean;
  /**
   * EXPERIMENTAL: rows near the pointer magnify, borrowing space from the rest.
   * Off by default — the hit-test cannot be made exact on this substrate.
   */
  lens: boolean;
  /** Colour the bars by type too, or leave them neutral and let the rail carry it. */
  barColor: "neutral" | "type";
  compress: boolean;
  showReadout: boolean;
};

export function TimelineDense({
  roots,
  box,
  showNames,
  lens,
  barColor,
  compress,
  showReadout,
}: TimelineDenseProps) {
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [view, setView] = useState<TimeSpan | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const prepared = useMemo(() => prepareTimeline(roots), [roots]);
  const measurer = useMemo(() => createTextMeasurer(), []);

  const railWidth = showNames ? 132 : RAIL_WIDTH;
  const laneWidth = Math.max(box.width - FRAME_BORDER * 2 - railWidth, 0);
  const viewportHeight = Math.max(
    box.height -
      FRAME_BORDER * 2 -
      AXIS_HEIGHT -
      (showReadout ? READOUT_HEIGHT : 0),
    0,
  );

  const fit = resolveVerticalFit({
    rowCount: prepared.rows.length,
    boxHeight: viewportHeight,
  });

  // INTEGER row geometry, deliberately. Distributing the viewport across the
  // rows gives fractional heights (604/150 = 4.027), and then the browser rounds
  // each row to device pixels while a hit-test computed from the unrounded model
  // does not — which lands you on the neighbouring row roughly a third of the
  // time at a 4px row height. Integral rows make the hit-test exact and the 3px
  // bars crisp; the few leftover pixels stay empty at the bottom.
  const contentHeight = prepared.rows.length * fit.rowHeight;

  const restingRows = useMemo(
    () =>
      Array.from({ length: prepared.rows.length }, (_, index) => ({
        index,
        y: index * fit.rowHeight,
        height: fit.rowHeight,
        magnification: 1,
      })),
    [prepared.rows.length, fit.rowHeight],
  );

  const lensRows = useMemo(
    () =>
      lens && focusIndex != null
        ? applyFocusLens({
            rowCount: prepared.rows.length,
            totalHeight: contentHeight,
            focusIndex,
            radius: LENS_RADIUS_ROWS,
            magnification: LENS_MAGNIFICATION,
          })
        : restingRows,
    [prepared.rows.length, contentHeight, lens, focusIndex, restingRows],
  );

  const density: Density = useMemo(
    () => ({
      pointer: "fine",
      rowHeight: fit.rowHeight,
      barHeight: fit.barHeight,
      labelFontPx: 11,
      labelPaddingPx: 4,
      labelGapPx: 6,
      minBarWidthPx: fit.presentation === "hairline" ? 2 : 4,
    }),
    [fit.rowHeight, fit.barHeight, fit.presentation],
  );

  const chartBox = useMemo(
    () => ({ width: laneWidth, height: viewportHeight }),
    [laneWidth, viewportHeight],
  );
  const compression = useMemo(
    () => timeCompressionFor(prepared, chartBox, compress),
    [prepared, chartBox, compress],
  );

  // Horizontal geometry from the same pure layout() production uses; vertical
  // geometry is this component's own, and layout() knows nothing about it.
  const result = layout({
    roots,
    box: chartBox,
    density,
    measurer,
    view,
    compress,
    prepared,
    compression,
  });

  const traceSpace = useMemo(
    () => traceSpaceOf(compression.compressedDurationMs),
    [compression.compressedDurationMs],
  );
  const fitted = isFitted(result.view, traceSpace);

  const zoomBy = useCallback(
    (factor: number, anchorRatio: number) =>
      setView((current) =>
        zoomView(current ?? fitView(traceSpace), traceSpace, {
          factor,
          anchorRatio,
        }),
      ),
    [traceSpace],
  );

  const panBy = useCallback(
    (deltaPx: number) =>
      setView((current) => {
        const from = current ?? fitView(traceSpace);
        const pxPerMs = laneWidth > 0 ? laneWidth / from.duration : 0;
        return panView(from, traceSpace, pxPerMs > 0 ? deltaPx / pxPerMs : 0);
      }),
    [traceSpace, laneWidth],
  );

  const gesture = useRef({ startX: 0, lastX: 0, dragging: false, down: false });

  /**
   * Wheel and trackpad pinch, on a non-passive listener so the page cannot take
   * the gesture. A Mac pinch arrives as wheel + ctrlKey, so it needs no special
   * case. When the rows fit there is no vertical scroll to spend a plain wheel
   * on, so a plain wheel zooms too; when they overflow it scrolls and only
   * ctrl/⌘ zooms.
   */
  const attachSurface = useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = element;
      if (!element) return;

      const onWheel = (event: WheelEvent) => {
        const pinch = event.ctrlKey || event.metaKey;
        if (!pinch && !fit.fitsWithoutScroll && event.deltaX === 0) return;

        event.preventDefault();
        const rect = element.getBoundingClientRect();
        const anchorRatio =
          laneWidth > 0
            ? (event.clientX - rect.left - railWidth) / laneWidth
            : 0.5;
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && !pinch) {
          panBy(-event.deltaX);
          return;
        }
        // Proportional to the delta: a mouse wheel sends few large deltas and a
        // trackpad sends many small ones, and both should feel the same.
        const steps = Math.min(Math.abs(event.deltaY) / 100, 4);
        const factor = ZOOM_STEP ** steps;
        zoomBy(event.deltaY < 0 ? factor : 1 / factor, anchorRatio);
      };

      element.addEventListener("wheel", onWheel, { passive: false });
      return () => element.removeEventListener("wheel", onWheel);
    },
    [fit.fitsWithoutScroll, laneWidth, railWidth, panBy, zoomBy],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    gesture.current = {
      startX: event.clientX,
      lastX: event.clientX,
      dragging: false,
      down: true,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0);

    const state = gesture.current;
    if (state.down) {
      if (!state.dragging) {
        if (Math.abs(event.clientX - state.startX) >= DRAG_THRESHOLD_PX) {
          state.dragging = true;
          // Capture only once it is really a drag, so a plain click still lands
          // on the row rather than on this container.
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }
      if (state.dragging) {
        panBy(event.clientX - state.lastX);
        state.lastX = event.clientX;
        return;
      }
    }

    // Rows are uniform without the lens, so this hit-test is exact.
    setFocusIndex(rowIndexAtY(lensRows, y));
    setPointer({ x, y: event.clientY - rect.top });
  };

  const onPointerUp = () => {
    gesture.current.down = false;
    gesture.current.dragging = false;
  };

  const clearFocus = useCallback(() => {
    setFocusIndex(null);
    setPointer(null);
    gesture.current.down = false;
    gesture.current.dragging = false;
  }, []);

  const focused = focusIndex == null ? null : result.nodes[focusIndex];

  return (
    <div
      className="bg-background border-border text-foreground flex flex-col overflow-hidden rounded border select-none"
      style={{ width: `${box.width}px`, height: `${box.height}px` }}
    >
      <div
        className="border-border relative shrink-0 border-b"
        style={{ height: `${AXIS_HEIGHT}px` }}
      >
        <div
          className="absolute inset-y-0"
          style={{ left: `${railWidth}px`, width: `${laneWidth}px` }}
        >
          {result.ticks.map((tick) => (
            <div
              key={tick.realMs}
              className="border-border-contrast absolute inset-y-0 border-l"
              style={{ left: `${tick.x}px` }}
            >
              <span
                className="text-muted-foreground absolute left-1 whitespace-nowrap"
                style={{ fontSize: "9px" }}
              >
                {tick.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        ref={attachSurface}
        className={cn(
          "relative min-h-0 flex-1 overflow-x-hidden",
          fit.fitsWithoutScroll ? "overflow-y-hidden" : "overflow-y-auto",
        )}
        style={{ touchAction: fit.fitsWithoutScroll ? "none" : "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={clearFocus}
        onPointerCancel={clearFocus}
        onDoubleClick={() => setView(null)}
        data-testid="timeline-dense-surface"
      >
        <div
          className="relative"
          style={{ height: `${contentHeight}px` }}
          data-testid="timeline-dense-content"
        >
          {/* Gridlines behind the rows: at hairline density they are most of
              what tells you where you are in time. */}
          <div
            className="pointer-events-none absolute inset-y-0"
            style={{ left: `${railWidth}px`, width: `${laneWidth}px` }}
          >
            {result.ticks.map((tick) => (
              <div
                key={tick.realMs}
                className="border-border/40 absolute inset-y-0 border-l"
                style={{ left: `${tick.x}px` }}
              />
            ))}
            {result.gaps.map((gap) => (
              <div
                key={`${gap.x}-${gap.durationMs}`}
                className="bg-muted border-border-contrast absolute inset-y-0 border-x border-dashed"
                style={{ left: `${gap.x}px`, width: `${gap.width}px` }}
                title={`${gap.label} of idle time, collapsed`}
              />
            ))}
          </div>

          {result.nodes.map((node) => {
            const lensRow = lensRows[node.index];
            if (!lensRow || lensRow.height <= 0) return null;
            const isFocused = node.index === focusIndex;
            const isSelected = node.index === selectedIndex;
            // The bar keeps a share of the row so the gap survives magnification.
            const barHeight = Math.max(
              Math.min(fit.barHeight, lensRow.height - 1),
              1,
            );
            const showText =
              showNames || lensRow.height >= 14 || isFocused || isSelected;
            const typeColor = TYPE_COLOR[node.type] ?? FALLBACK_COLOR;

            return (
              <div
                key={node.id}
                className={cn(
                  "absolute inset-x-0 cursor-pointer",
                  // At 4px a tint is not enough to find yourself by, so the
                  // hovered row takes a full-width accent wash and its bar goes
                  // solid accent below.
                  isSelected && "bg-primary-accent/20",
                  isFocused && !isSelected && "bg-primary-accent/15",
                )}
                style={{ top: `${lensRow.y}px`, height: `${lensRow.height}px` }}
                onClick={() => setSelectedIndex(node.index)}
              >
                {/* Type rail: a 2px-square of the type's own hue, indented by
                    depth so the column also sketches the hierarchy. */}
                <div
                  className="absolute inset-y-0 overflow-hidden"
                  style={{ width: `${railWidth}px` }}
                >
                  <div
                    className={cn("absolute", typeColor)}
                    style={{
                      left: `${Math.min(node.depth, RAIL_MAX_DEPTH) * RAIL_INDENT + 1}px`,
                      top: `${Math.max((lensRow.height - Math.min(barHeight, 4)) / 2, 0)}px`,
                      width: `${Math.min(barHeight, 4)}px`,
                      height: `${Math.min(barHeight, 4)}px`,
                    }}
                  />
                  {showNames ? (
                    <span
                      className="text-foreground absolute truncate"
                      style={{
                        left: `${Math.min(node.depth, RAIL_MAX_DEPTH) * RAIL_INDENT + 8}px`,
                        right: "2px",
                        top: `${Math.max((lensRow.height - 12) / 2, 0)}px`,
                        fontSize: "10px",
                      }}
                      title={node.name}
                    >
                      {node.name}
                    </span>
                  ) : null}
                </div>

                <div
                  className="absolute inset-y-0 overflow-hidden"
                  style={{ left: `${railWidth}px`, width: `${laneWidth}px` }}
                >
                  <div
                    className={cn(
                      "absolute rounded-[1px]",
                      barColor === "type"
                        ? typeColor
                        : "bg-muted-foreground/60",
                      isFocused && "ring-primary-accent ring-1",
                      isSelected && "bg-primary-accent",
                    )}
                    style={{
                      left: `${node.x}px`,
                      width: `${node.width}px`,
                      top: `${Math.max((lensRow.height - barHeight) / 2, 0)}px`,
                      height: `${barHeight}px`,
                    }}
                    data-testid="timeline-dense-bar"
                  />
                  {showText && node.label ? (
                    <span
                      className="text-muted-foreground absolute whitespace-nowrap"
                      style={{
                        left: `${Math.min(node.x + node.width + 4, laneWidth)}px`,
                        top: `${Math.max((lensRow.height - 12) / 2, 0)}px`,
                        fontSize: "10px",
                      }}
                    >
                      {node.label}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* The tooltip is the text this layout does not spend on rows. It
            follows the cursor and flips before it can leave the box. */}
        {focused && pointer ? (
          <div
            className="border-border bg-background text-foreground pointer-events-none absolute z-10 flex max-w-[90%] items-center gap-1 rounded border px-1.5 py-1 shadow-md"
            style={{
              left:
                pointer.x > laneWidth * 0.55
                  ? undefined
                  : `${Math.round(pointer.x + 12)}px`,
              right:
                pointer.x > laneWidth * 0.55
                  ? `${Math.round(Math.max(box.width - pointer.x + 12, 4))}px`
                  : undefined,
              top: `${Math.round(
                Math.min(
                  Math.max(pointer.y + 12, 2),
                  Math.max(viewportHeight - 26, 2),
                ) + (scrollRef.current?.scrollTop ?? 0),
              )}px`,
              fontSize: "10px",
            }}
            data-testid="timeline-dense-tooltip"
          >
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-[1px]",
                TYPE_COLOR[focused.type] ?? FALLBACK_COLOR,
              )}
            />
            <span className="truncate" title={focused.name}>
              {focused.name}
            </span>
            <span className="text-muted-foreground shrink-0">
              {focused.durationMs == null
                ? "—"
                : formatDurationMs(focused.durationMs)}
            </span>
            <span className="text-muted-foreground shrink-0">
              @{formatDurationMs(focused.startMs)}
            </span>
          </div>
        ) : null}
      </div>

      {showReadout ? (
        <div
          className="border-border text-muted-foreground flex shrink-0 items-center gap-2 overflow-hidden border-t px-1 whitespace-nowrap"
          style={{ height: `${READOUT_HEIGHT}px`, fontSize: "10px" }}
          data-testid="timeline-dense-readout"
        >
          <span>
            {box.width}×{box.height} · lane {laneWidth}
          </span>
          <span>
            {prepared.rows.length} rows @ {fit.rowHeight}px ({fit.presentation})
          </span>
          <span>
            {fit.fitsWithoutScroll
              ? "no scroll"
              : `scrolls: ${fit.overflowRows} rows over capacity ${fit.capacityAtFloor}`}
          </span>
          <span>{result.pxPerMs.toFixed(3)} px/ms</span>
          <span>{fitted ? "whole trace" : "zoomed — double-click to fit"}</span>
        </div>
      ) : null}
    </div>
  );
}
