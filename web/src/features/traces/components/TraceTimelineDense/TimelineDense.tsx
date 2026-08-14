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
 *  - The left side is adaptive: a bare colour rail by default, opening into the
 *    real tree gutter — the observation's own icon and name, indented by depth —
 *    as the rows grow past ~20px, and peekable earlier by hovering it (tapping it
 *    on touch). It cannot open below ~14px rows, because there is no name to show
 *    in a 4px row; the hover tooltip is what names a row at that density.
 *    Working in the chart hands the space straight back.
 *  - Two-finger scroll pans both axes; pinch (and a discrete mouse notch) zooms
 *    BOTH axes about the cursor, so the time window narrows and the rows grow
 *    together. Zoom is exponential in a zoom level and deltas accumulate per
 *    frame, as in mapping libraries — see the rate constants below.
 *  - Drag pans both axes too. There are no scrollbars by design: a map has none,
 *    and the viewport clamps to the content so there is nowhere to get lost.
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
import {
  Maximize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { cn } from "@/src/utils/tailwind";
import { type Density, type PointerModality } from "../../fns/timeline/density";
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
  HUMAN_ROW_HEIGHT,
  rowCountBounds,
  viewportsEqual,
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
/** Indent per level once the gutter is open, matching the production gutter. */
const GUTTER_INDENT = 10;
const TOOLBAR_HEIGHT = 22;
const AXIS_HEIGHT = 16;
const READOUT_HEIGHT = 18;
const FRAME_BORDER = 1;
/**
 * Zoom is exponential in a zoom LEVEL — one level doubles the scale — and input
 * deltas accumulate into level deltas, which is how every mapping library does
 * it. The rate has to depend on the input device, and mapping libraries ship two
 * constants for exactly this reason: macOS sends pinch deltas of only a few
 * units while a mouse notch is ~100, so one divisor cannot serve both. A single
 * linear factor per event with a /100 divisor moved ~1% per pinch event, which
 * is why it felt like a lot of touching to get anywhere.
 */
const PINCH_ZOOM_RATE = 1 / 40;
const WHEEL_ZOOM_RATE = 1 / 160;
/** A deltaMode-0 event bigger than this is a mouse notch, not a trackpad. */
const WHEEL_DELTA_THRESHOLD = 40;
/** Step for the toolbar buttons and the keyboard, in zoom levels. */
const BUTTON_ZOOM_LEVELS = 0.6;
const DRAG_THRESHOLD_PX = 3;
const MAX_BAR_HEIGHT = 18;
/** Below this a row cannot hold a name, so the gutter stays a rail. */
const NAME_MIN_ROW_HEIGHT = 14;
/** The chart never shrinks below this to make room for names. */
const MIN_LANE_WIDTH = 140;
/** Slack around the rail so the peek zone is reachable at 10px wide. */
const PEEK_MARGIN_PX = 6;

/**
 * How wide the left side is once something has asked for it to open. The chart
 * keeps priority: if opening would leave the lane below MIN_LANE_WIDTH it stays a
 * rail, because the timeline is the point of the surface.
 */
function resolveGutterWidth(input: {
  open: boolean;
  contentWidth: number;
}): number {
  if (!input.open) return RAIL_WIDTH;
  const wanted = Math.min(Math.max(input.contentWidth * 0.38, 96), 168);
  return input.contentWidth - wanted >= MIN_LANE_WIDTH ? wanted : RAIL_WIDTH;
}

export type TimelineDenseProps = {
  roots: LayoutNode[];
  /** The measured box. Required — there is no fallback size. */
  box: Box;
  /**
   * Starting gutter mode. `auto` derives it from row height — a hairline row
   * cannot hold a name, a 26px row can — which is the default and the point of
   * this layout.
   */
  gutter: GutterMode;
  /**
   * Input modality. `fine` peeks the gutter on hover; `coarse` has no hover, so
   * it toggles on a tap of the rail.
   */
  pointer: PointerModality;
  /** Colour the bars by type too, or leave them neutral and let the rail carry it. */
  barColor: "neutral" | "type";
  compress: boolean;
  showReadout: boolean;
};

export type GutterMode = "auto" | "expanded" | "collapsed";

export function TimelineDense({
  roots,
  box,
  gutter,
  pointer,
  barColor,
  compress,
  showReadout,
}: TimelineDenseProps) {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const prepared = useMemo(() => prepareTimeline(roots), [roots]);
  // Rendered at 10px, so measured at 10px: layout() decides which side a label
  // goes on, and that decision is only as good as the font it measured.
  const measurer = useMemo(() => createTextMeasurer("10px ui-sans-serif"), []);

  // A manual override lives until you touch the chart again, which is what
  // "expand to look, then get out of my way" means in practice.
  const [override, setOverride] = useState<GutterMode | null>(null);
  // Desktop peek: hovering the left edge opens it, moving into the chart closes
  // it again. No click to look, no click to get out of the way.
  const [peeking, setPeeking] = useState(false);
  const gutterMode = override ?? gutter;
  const contentWidth = Math.max(box.width - FRAME_BORDER * 2, 0);
  const surfaceHeight = Math.max(
    box.height -
      FRAME_BORDER * 2 -
      TOOLBAR_HEIGHT -
      AXIS_HEIGHT -
      (showReadout ? READOUT_HEIGHT : 0),
    0,
  );

  // Resolve the VERTICAL window first. It depends only on the row count and the
  // height, never on the width, so row height is known before the gutter width
  // — which is what breaks the cycle (gutter → lane → compression → viewport).
  // Deciding the gutter from the *resting* row height instead left it a rail
  // forever, however far you zoomed in.
  const rowBounds = rowCountBounds({
    rowCount: prepared.rows.length,
    boxHeight: surfaceHeight,
  });
  const liveRowCount = Math.min(
    Math.max(viewport?.rows.count ?? rowBounds.max, rowBounds.min),
    rowBounds.max,
  );
  const liveRowHeight =
    liveRowCount > 0 ? surfaceHeight / liveRowCount : HUMAN_ROW_HEIGHT;

  // The left side is the key to the lines — the tree gutter, names and all. It
  // can only open when the rows are tall enough to hold a name: at 4px there is
  // no name to show, and the hover tooltip is what names a row at that density.
  const canShowNames = liveRowHeight >= NAME_MIN_ROW_HEIGHT;
  const gutterOpen =
    !canShowNames || override === "collapsed"
      ? false
      : override === "expanded" || peeking
        ? true
        : gutterMode === "expanded" ||
          (gutterMode === "auto" && liveRowHeight >= HUMAN_ROW_HEIGHT - 6);
  const railWidth = resolveGutterWidth({ open: gutterOpen, contentWidth });
  const laneWidth = Math.max(contentWidth - railWidth, 0);

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
  const isOpen = railWidth > RAIL_WIDTH;
  const namesVisible = isOpen;
  const presentation = presentationForRowHeight(rowHeight);
  const fitted = isViewportFitted(current, limits);
  const barHeight = Math.max(Math.min(rowHeight - 1, MAX_BAR_HEIGHT), 1);

  const density: Density = useMemo(
    () => ({
      pointer,
      rowHeight,
      barHeight: Math.max(Math.min(rowHeight - 1, MAX_BAR_HEIGHT), 1),
      labelFontPx: 11,
      labelPaddingPx: 4,
      labelGapPx: 6,
      minBarWidthPx: presentation === "hairline" ? 2 : 4,
    }),
    [rowHeight, presentation, pointer],
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

  // The gesture path reads the viewport from a ref, not from render scope: a
  // trackpad fires many events per frame and each must build on the last, not on
  // whatever React had rendered when the burst started.
  const viewportRef = useRef(current);
  viewportRef.current = current;

  // Deltas accumulate and apply once per animation frame — the other half of
  // what makes map zoom feel immediate instead of laggy under a burst.
  const pending = useRef({
    levels: 0,
    dxPx: 0,
    dyPx: 0,
    xRatio: 0.5,
    yRatio: 0.5,
    frame: 0,
  });

  const releaseOverride = useCallback(() => {
    setOverride((held) => (held === "expanded" ? null : held));
    setPeeking(false);
  }, []);

  const flushGesture = useCallback(() => {
    const queued = pending.current;
    queued.frame = 0;
    let next = viewportRef.current;
    if (queued.levels !== 0) {
      next = zoomViewport(next, limits, {
        factor: 2 ** queued.levels,
        xRatio: queued.xRatio,
        yRatio: queued.yRatio,
      });
    }
    if (queued.dxPx !== 0 || queued.dyPx !== 0) {
      next = panViewport(next, limits, {
        dxPx: queued.dxPx,
        dyPx: queued.dyPx,
        boxWidth: laneWidth,
      });
    }
    queued.levels = 0;
    queued.dxPx = 0;
    queued.dyPx = 0;
    if (viewportsEqual(next, viewportRef.current)) return;
    viewportRef.current = next;
    setViewport(next);
  }, [limits, laneWidth]);

  const scheduleGesture = useCallback(() => {
    // Any gesture on the chart hands the space back: an expanded gutter is for
    // looking, and the moment you work in the chart it gets out of the way.
    releaseOverride();
    if (pending.current.frame) return;
    pending.current.frame = requestAnimationFrame(flushGesture);
  }, [flushGesture, releaseOverride]);

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
        const rect = element.getBoundingClientRect();
        const queued = pending.current;
        // A macOS pinch is the ONLY wheel event that carries ctrlKey. A
        // two-finger scroll is a plain wheel, so it must pan — treating it as
        // zoom is what made scrolling around zoom the rows instead.
        const pinch = event.ctrlKey || event.metaKey;

        if (pinch) {
          queued.xRatio =
            rect.width > 0
              ? (event.clientX - rect.left - railWidth) /
                Math.max(rect.width - railWidth, 1)
              : 0.5;
          queued.yRatio =
            rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
          queued.levels += -event.deltaY * PINCH_ZOOM_RATE;
          event.preventDefault();
          scheduleGesture();
          return;
        }

        // A discrete mouse notch has no pan intent behind it, so it zooms, at
        // its own much slower rate per unit of delta.
        const isMouseNotch =
          event.deltaMode !== 0 ||
          Math.abs(event.deltaY) >= WHEEL_DELTA_THRESHOLD;
        if (isMouseNotch && event.deltaX === 0 && !event.shiftKey) {
          queued.xRatio =
            rect.width > 0
              ? (event.clientX - rect.left - railWidth) /
                Math.max(rect.width - railWidth, 1)
              : 0.5;
          queued.yRatio =
            rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
          queued.levels += -event.deltaY * WHEEL_ZOOM_RATE;
          event.preventDefault();
          scheduleGesture();
          return;
        }

        // Two-finger scroll: pan both axes. Shift maps a vertical wheel to time.
        const dxPx = event.shiftKey ? -event.deltaY : -event.deltaX;
        const dyPx = event.shiftKey ? 0 : -event.deltaY;
        const wouldMove = panViewport(viewportRef.current, limits, {
          dxPx,
          dyPx,
          boxWidth: laneWidth,
        });
        // Only swallow the gesture if it actually moves us; at a clamp the page
        // keeps its scroll instead of being trapped.
        if (viewportsEqual(wouldMove, viewportRef.current)) return;
        event.preventDefault();
        queued.dxPx += dxPx;
        queued.dyPx += dyPx;
        scheduleGesture();
      };

      element.addEventListener("wheel", onWheel, { passive: false });
      return () => element.removeEventListener("wheel", onWheel);
    },
    [railWidth, limits, laneWidth, scheduleGesture],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Touch has no hover, so a tap on the rail is the toggle.
    const offsetX =
      event.clientX - event.currentTarget.getBoundingClientRect().left;
    if (
      (pointer === "coarse" || event.pointerType === "touch") &&
      offsetX <= railWidth + PEEK_MARGIN_PX
    ) {
      setOverride(isOpen ? "collapsed" : "expanded");
      return;
    }
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
        releaseOverride();
        panBy(dx, dy);
        state.x = event.clientX;
        state.y = event.clientY;
        return;
      }
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const offsetX = event.clientX - rect.left;

    // Peek is hover-driven on a fine pointer only: a coarse pointer has no
    // hover, so it toggles on tap instead (see onPointerDown).
    if (pointer === "fine" && event.pointerType !== "touch") {
      setPeeking(offsetX <= railWidth + PEEK_MARGIN_PX);
    }

    setFocusIndex(
      rowIndexAtOffset(current, offsetY, rowHeight, prepared.rows.length),
    );
    setPointerPos({ x: offsetX, y: offsetY });
  };

  const endGesture = useCallback(() => {
    gesture.current.down = false;
    gesture.current.dragging = false;
    setDragging(false);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusIndex(null);
    setPointerPos(null);
    setPeeking(false);
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
          onClick={() => zoomBy(2 ** -BUTTON_ZOOM_LEVELS, 0.5, 0.5)}
        >
          <Minus className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton
          label="Zoom in"
          onClick={() => zoomBy(2 ** BUTTON_ZOOM_LEVELS, 0.5, 0.5)}
        >
          <Plus className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton
          label="Fit whole trace"
          onClick={() => setViewport(null)}
        >
          <Maximize2 className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton
          label={isOpen ? "Collapse names" : "Show names"}
          onClick={() => setOverride(isOpen ? "collapsed" : "expanded")}
        >
          {isOpen ? (
            <PanelLeftClose className="h-3 w-3" />
          ) : (
            <PanelLeftOpen className="h-3 w-3" />
          )}
        </ToolbarButton>
        <span
          className="text-muted-foreground truncate"
          style={{ fontSize: "10px" }}
          title={
            fitted
              ? "scroll to pan · pinch to zoom · double-click to focus"
              : `${rowHeight.toFixed(1)}px rows · ${windowLabel} window`
          }
        >
          {fitted
            ? "scroll to pan · pinch to zoom · double-click to focus"
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
            const indent = namesVisible
              ? Math.min(node.depth, RAIL_MAX_DEPTH) * GUTTER_INDENT
              : Math.min(node.depth, RAIL_MAX_DEPTH) * RAIL_INDENT + 1;

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
                  {/* Tree connectors, same visual language as the production
                      gutter: an ancestor rail per level that still has a sibling
                      below, then this node's elbow into its own icon. */}
                  {namesVisible
                    ? node.treeLines
                        .slice(0, Math.min(node.depth, RAIL_MAX_DEPTH))
                        .map((continues, level) =>
                          continues ? (
                            <div
                              key={level}
                              className="bg-border-contrast absolute inset-y-0 w-px"
                              style={{ left: `${level * GUTTER_INDENT + 5}px` }}
                            />
                          ) : null,
                        )
                    : null}
                  {namesVisible && node.depth > 0 ? (
                    <>
                      <div
                        className={cn(
                          "bg-border-contrast absolute top-0 w-px",
                          node.isLastSibling ? "h-1/2" : "bottom-0",
                        )}
                        style={{
                          left: `${(Math.min(node.depth, RAIL_MAX_DEPTH) - 1) * GUTTER_INDENT + 5}px`,
                        }}
                      />
                      <div
                        className="bg-border-contrast absolute top-1/2 h-px"
                        style={{
                          left: `${(Math.min(node.depth, RAIL_MAX_DEPTH) - 1) * GUTTER_INDENT + 5}px`,
                          width: `${GUTTER_INDENT}px`,
                        }}
                      />
                    </>
                  ) : null}
                  {namesVisible ? (
                    <div
                      className="absolute flex items-center gap-1 overflow-hidden"
                      style={{
                        left: `${indent + 6}px`,
                        right: "2px",
                        top: `${Math.max((rowHeight - 16) / 2, 0)}px`,
                        height: "16px",
                      }}
                    >
                      <span className="shrink-0">
                        <ItemBadge
                          type={node.type as LangfuseItemType}
                          isSmall
                        />
                      </span>
                      <span
                        className="text-foreground truncate"
                        style={{ fontSize: "10px" }}
                        title={node.name}
                      >
                        {node.name}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div
                  className="absolute inset-y-0 overflow-hidden"
                  style={{ left: `${railWidth}px`, width: `${laneWidth}px` }}
                >
                  {/* A span outside the time window is clamped to the lane edge
                      by layout(). Drawing it as a bar stacked every out-of-view
                      span into a column of marks that corresponds to nothing —
                      so it becomes a caret at the edge it lies beyond, and the
                      row itself stays for hover and selection. */}
                  {node.offscreen ? (
                    <div
                      className={cn(
                        "absolute w-[2px] opacity-40",
                        barColor === "type"
                          ? typeColor
                          : "bg-muted-foreground/60",
                      )}
                      style={{
                        left: node.x <= 0 ? "0px" : undefined,
                        right: node.x <= 0 ? undefined : "0px",
                        top: `${Math.max((rowHeight - barHeight) / 2, 0)}px`,
                        height: `${barHeight}px`,
                      }}
                      title={`Outside the time window — starts at ${formatDurationMs(node.startMs)}`}
                      data-testid="timeline-dense-offscreen"
                    />
                  ) : (
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
                  )}
                  {/* Text comes back on its own as the rows grow — and it goes
                      on whichever side layout() measured room for, rather than
                      always after the bar, which clipped a full-width bar's
                      label at the lane edge. */}
                  {presentation === "labelled" &&
                  node.label &&
                  !node.offscreen &&
                  node.labelPlacement !== "hidden" ? (
                    <span
                      className={cn(
                        "absolute whitespace-nowrap",
                        node.labelPlacement === "inside"
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                      style={{
                        left: `${node.labelX}px`,
                        maxWidth: `${Math.max(laneWidth - node.labelX, 0)}px`,
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

        {/* The tooltip is what names a row when the gutter cannot. */}
        {focused && pointerPos && !dragging ? (
          <div
            className="border-border bg-background text-foreground pointer-events-none absolute z-10 flex max-w-[90%] items-center gap-1 rounded border px-1.5 py-1 shadow-md"
            style={{
              left:
                pointerPos.x > box.width * 0.55
                  ? undefined
                  : `${Math.round(pointerPos.x + 12)}px`,
              right:
                pointerPos.x > box.width * 0.55
                  ? `${Math.round(Math.max(box.width - pointerPos.x + 12, 4))}px`
                  : undefined,
              top: `${Math.round(
                Math.min(
                  Math.max(pointerPos.y + 12, 2),
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
          <span data-testid="dense-rowheight">
            {rowHeight.toFixed(1)}px rows ({presentation})
          </span>
          <span data-testid="dense-rows">
            rows {current.rows.start.toFixed(1)}–
            {(current.rows.start + current.rows.count).toFixed(1)} of{" "}
            {prepared.rows.length}
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
