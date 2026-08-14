/**
 * Throwaway renderer for the extreme-density spike.
 *
 * The question it exists to answer: in a narrow, tall layout, does killing the
 * names and the text and spending every pixel on shape make you FEEL the
 * timeline — where a 26px row with a duration label next to a 4px bar reads as
 * a list of numbers instead?
 *
 * At rest: no name gutter, a 10px rail carrying type as a small square in the
 * type's own hue, rows shrunk to fit the box, and no text at all.
 *
 * Then it is driven **like a map**, because that is what exploring a dense
 * surface wants:
 *  - Wheel and trackpad pinch zoom BOTH axes about the cursor — the time window
 *    narrows and the rows grow together.
 *  - Drag pans both axes. There are no scrollbars by design: a map has none, and
 *    the viewport clamps to the content so there is nowhere to get lost.
 *  - Double-click an element focuses it — the time window onto its own extent,
 *    the rows at a height a human reads, the element centred.
 *  - What a row shows follows from how tall it has become: the type square grows
 *    around 10px, text returns around 20px. Zooming in makes the timeline grow
 *    its labels back rather than switching mode.
 *
 * A magnifying lens (rows near the pointer expanding, borrowing space from the
 * rest) is implemented and tested in fns/timeline/focusLens.ts and deliberately
 * NOT wired up: a fisheye needs an invertible transform to hit-test correctly,
 * and absolutely-positioned rows are the wrong substrate. That is the next spike.
 *
 * Not production code.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
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
import { traceSpaceOf, type Box } from "../../fns/timeline/viewTransform";
import {
  clampViewport,
  fitViewport,
  focusViewport,
  isViewportFitted,
  panViewport,
  presentationForRowHeight,
  rowHeightOf,
  rowIndexAtOffset,
  visibleRowRange,
  zoomViewport,
  type Viewport,
} from "../../fns/timeline/viewport";

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
const TOOLBAR_HEIGHT = 22;
const AXIS_HEIGHT = 16;
const READOUT_HEIGHT = 18;
const FRAME_BORDER = 1;
const ZOOM_STEP = 1.3;
const DRAG_THRESHOLD_PX = 3;
const MAX_BAR_HEIGHT = 18;

export type TimelineDenseProps = {
  roots: LayoutNode[];
  /** The measured box. Required — there is no fallback size. */
  box: Box;
  /** Names are hidden by default: that is the whole point of this layout. */
  showNames: boolean;
  /** Colour the bars by type too, or leave them neutral and let the rail carry it. */
  barColor: "neutral" | "type";
  compress: boolean;
  showReadout: boolean;
};

export function TimelineDense({
  roots,
  box,
  showNames,
  barColor,
  compress,
  showReadout,
}: TimelineDenseProps) {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const prepared = useMemo(() => prepareTimeline(roots), [roots]);
  const measurer = useMemo(() => createTextMeasurer(), []);

  const railWidth = showNames ? 132 : RAIL_WIDTH;
  const laneWidth = Math.max(box.width - FRAME_BORDER * 2 - railWidth, 0);
  const surfaceHeight = Math.max(
    box.height -
      FRAME_BORDER * 2 -
      TOOLBAR_HEIGHT -
      AXIS_HEIGHT -
      (showReadout ? READOUT_HEIGHT : 0),
    0,
  );

  const chartBox = useMemo(
    () => ({ width: laneWidth, height: surfaceHeight }),
    [laneWidth, surfaceHeight],
  );
  const compression = useMemo(
    () => timeCompressionFor(prepared, chartBox, compress),
    [prepared, chartBox, compress],
  );

  const limits = useMemo(
    () => ({
      traceSpace: traceSpaceOf(compression.compressedDurationMs),
      rowCount: prepared.rows.length,
      boxHeight: surfaceHeight,
    }),
    [compression.compressedDurationMs, prepared.rows.length, surfaceHeight],
  );

  // Re-clamped every render, so a resize can never leave the viewport looking
  // outside the content.
  const current = useMemo(
    () => (viewport ? clampViewport(viewport, limits) : fitViewport(limits)),
    [viewport, limits],
  );
  const rowHeight = rowHeightOf(current, surfaceHeight);
  const presentation = presentationForRowHeight(rowHeight);
  const fitted = isViewportFitted(current, limits);
  const barHeight = Math.max(Math.min(rowHeight - 1, MAX_BAR_HEIGHT), 1);

  const density: Density = useMemo(
    () => ({
      pointer: "fine",
      rowHeight,
      barHeight: Math.max(Math.min(rowHeight - 1, MAX_BAR_HEIGHT), 1),
      labelFontPx: 11,
      labelPaddingPx: 4,
      labelGapPx: 6,
      minBarWidthPx: presentation === "hairline" ? 2 : 4,
    }),
    [rowHeight, presentation],
  );

  const rowRange = visibleRowRange(current, prepared.rows.length);
  const result = layout({
    roots,
    box: chartBox,
    density,
    measurer,
    view: current.time,
    compress,
    prepared,
    compression,
    rowRange,
  });

  const zoomBy = useCallback(
    (factor: number, xRatio: number, yRatio: number) =>
      setViewport((from) =>
        zoomViewport(
          from ? clampViewport(from, limits) : fitViewport(limits),
          limits,
          { factor, xRatio, yRatio },
        ),
      ),
    [limits],
  );

  const panBy = useCallback(
    (dxPx: number, dyPx: number) =>
      setViewport((from) =>
        panViewport(
          from ? clampViewport(from, limits) : fitViewport(limits),
          limits,
          { dxPx, dyPx, boxWidth: laneWidth },
        ),
      ),
    [limits, laneWidth],
  );

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef({ down: false, dragging: false, x: 0, y: 0 });

  /**
   * Wheel and trackpad pinch on a non-passive listener, so the page never takes
   * the gesture. Both zoom, like a map: a Mac pinch arrives as wheel + ctrlKey
   * and needs no special case; shift or a horizontal wheel pans instead.
   */
  const attachSurface = useCallback(
    (element: HTMLDivElement | null) => {
      surfaceRef.current = element;
      if (!element) return;

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const rect = element.getBoundingClientRect();
        if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
          panBy(-(event.deltaX || event.deltaY), 0);
          return;
        }
        // Proportional to the delta: a mouse wheel sends few large deltas and a
        // trackpad many small ones, and both should feel the same.
        const steps = Math.min(Math.abs(event.deltaY) / 100, 4);
        const factor = ZOOM_STEP ** steps;
        const xRatio =
          rect.width > 0
            ? (event.clientX - rect.left - railWidth) /
              Math.max(rect.width - railWidth, 1)
            : 0.5;
        const yRatio =
          rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
        zoomBy(event.deltaY < 0 ? factor : 1 / factor, xRatio, yRatio);
      };

      element.addEventListener("wheel", onWheel, { passive: false });
      return () => element.removeEventListener("wheel", onWheel);
    },
    [panBy, zoomBy, railWidth],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    gesture.current = {
      down: true,
      dragging: false,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = gesture.current;
    if (state.down) {
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        state.dragging = true;
        setDragging(true);
        // Capture only once it really is a drag, so a click still reaches a row.
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (state.dragging) {
        panBy(dx, dy);
        state.x = event.clientX;
        state.y = event.clientY;
        return;
      }
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    setFocusIndex(
      rowIndexAtOffset(current, offsetY, rowHeight, prepared.rows.length),
    );
    setPointer({ x: event.clientX - rect.left, y: offsetY });
  };

  const endGesture = useCallback(() => {
    gesture.current.down = false;
    gesture.current.dragging = false;
    setDragging(false);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusIndex(null);
    setPointer(null);
    endGesture();
  }, [endGesture]);

  /** Double-click an element: both axes move to put it on screen, readably. */
  const focusRow = (index: number) => {
    const positioned = result.nodes.find((node) => node.index === index);
    if (!positioned) return;
    setSelectedIndex(index);
    const startMs = compression.toCompressedMs(positioned.startMs);
    setViewport(
      focusViewport(limits, {
        rowIndex: index,
        startMs,
        durationMs: compression.toCompressedMs(positioned.endMs) - startMs,
      }),
    );
  };

  const focused =
    focusIndex == null
      ? null
      : (result.nodes.find((node) => node.index === focusIndex) ?? null);

  const windowLabel = formatDurationMs(
    compression.toRealMs(current.time.start + current.time.duration) -
      compression.toRealMs(current.time.start),
  );

  return (
    <div
      className="bg-background border-border text-foreground flex flex-col overflow-hidden rounded border select-none"
      style={{ width: `${box.width}px`, height: `${box.height}px` }}
    >
      <div
        className="border-border flex shrink-0 items-center gap-1 border-b px-1"
        style={{ height: `${TOOLBAR_HEIGHT}px` }}
      >
        <ToolbarButton
          label="Zoom out"
          onClick={() => zoomBy(1 / ZOOM_STEP, 0.5, 0.5)}
        >
          <Minus className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton
          label="Zoom in"
          onClick={() => zoomBy(ZOOM_STEP, 0.5, 0.5)}
        >
          <Plus className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton
          label="Fit whole trace"
          onClick={() => setViewport(null)}
        >
          <Maximize2 className="h-3 w-3" />
        </ToolbarButton>
        <span
          className="text-muted-foreground truncate"
          style={{ fontSize: "10px" }}
          title={
            fitted
              ? "scroll to zoom · drag to pan · double-click to focus"
              : `${rowHeight.toFixed(1)}px rows · ${windowLabel} window`
          }
        >
          {fitted
            ? "scroll to zoom · drag to pan · double-click to focus"
            : `${rowHeight.toFixed(1)}px rows · ${windowLabel} window`}
        </span>
      </div>

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

      {/* The map surface. No scrollbars: panning is the gesture, and the
          viewport clamps to the content so there is nowhere to get lost. */}
      <div
        ref={attachSurface}
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerLeave={clearFocus}
        onPointerCancel={clearFocus}
        data-testid="timeline-dense-surface"
      >
        {/* The row layer clips its own rows. A row straddling the bottom edge
            is real and should be drawn, but it must not become overflow on the
            surface — a map has no scrollable extent. */}
        <div
          className="absolute inset-0 overflow-hidden"
          data-testid="timeline-dense-content"
        >
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
            const y = (node.index - current.rows.start) * rowHeight;
            if (y + rowHeight < 0 || y > surfaceHeight) return null;
            const isFocused = node.index === focusIndex;
            const isSelected = node.index === selectedIndex;
            const typeColor = TYPE_COLOR[node.type] ?? FALLBACK_COLOR;
            const squareSize = Math.max(Math.min(barHeight, 6), 2);
            const indent =
              Math.min(node.depth, RAIL_MAX_DEPTH) * RAIL_INDENT + 1;

            return (
              <div
                key={node.id}
                className={cn(
                  "absolute inset-x-0",
                  // At 4px a tint is not enough to find yourself by, so the
                  // hovered row takes a full-width accent wash.
                  isSelected && "bg-primary-accent/20",
                  isFocused && !isSelected && "bg-primary-accent/15",
                )}
                style={{ top: `${y}px`, height: `${rowHeight}px` }}
                onClick={() => setSelectedIndex(node.index)}
                onDoubleClick={() => focusRow(node.index)}
              >
                <div
                  className="absolute inset-y-0 overflow-hidden"
                  style={{ width: `${railWidth}px` }}
                >
                  <div
                    className={cn("absolute rounded-[1px]", typeColor)}
                    style={{
                      left: `${indent}px`,
                      top: `${Math.max((rowHeight - squareSize) / 2, 0)}px`,
                      width: `${squareSize}px`,
                      height: `${squareSize}px`,
                    }}
                  />
                  {showNames && presentation !== "hairline" ? (
                    <span
                      className="text-foreground absolute truncate"
                      style={{
                        left: `${indent + 8}px`,
                        right: "2px",
                        top: `${Math.max((rowHeight - 12) / 2, 0)}px`,
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
                      (isFocused || isSelected) && "bg-primary-accent",
                    )}
                    style={{
                      left: `${node.x}px`,
                      width: `${node.width}px`,
                      top: `${Math.max((rowHeight - barHeight) / 2, 0)}px`,
                      height: `${barHeight}px`,
                    }}
                    data-testid="timeline-dense-bar"
                  />
                  {/* Text comes back on its own as the rows grow. */}
                  {presentation === "labelled" && node.label ? (
                    <span
                      className="text-muted-foreground absolute whitespace-nowrap"
                      style={{
                        left: `${Math.min(node.x + node.width + 4, laneWidth)}px`,
                        top: `${Math.max((rowHeight - 12) / 2, 0)}px`,
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

        {/* The tooltip is the text this layout does not spend on rows. */}
        {focused && pointer && !dragging ? (
          <div
            className="border-border bg-background text-foreground pointer-events-none absolute z-10 flex max-w-[90%] items-center gap-1 rounded border px-1.5 py-1 shadow-md"
            style={{
              left:
                pointer.x > box.width * 0.55
                  ? undefined
                  : `${Math.round(pointer.x + 12)}px`,
              right:
                pointer.x > box.width * 0.55
                  ? `${Math.round(Math.max(box.width - pointer.x + 12, 4))}px`
                  : undefined,
              top: `${Math.round(
                Math.min(
                  Math.max(pointer.y + 12, 2),
                  Math.max(surfaceHeight - 26, 2),
                ),
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
            {rowHeight.toFixed(1)}px rows ({presentation})
          </span>
          <span>
            showing {Math.round(current.rows.count)}/{prepared.rows.length} rows
          </span>
          <span>{result.pxPerMs.toFixed(3)} px/ms</span>
          <span>{fitted ? "fitted" : "zoomed"}</span>
        </div>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="hover:bg-muted flex h-4 w-4 shrink-0 items-center justify-center rounded"
    >
      {children}
    </button>
  );
}
