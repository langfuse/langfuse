/**
 * Throwaway renderer for the size-adaptive timeline spike.
 *
 * Its only job is to make `layout()` visible: measured box in, absolutely
 * placed boxes out. Every coordinate on screen comes from the pure function —
 * no flex, no min-width and no intrinsic content sizing participates in where a
 * bar lands. There is deliberately no horizontal scroll anywhere: the whole
 * trace fits the box by default, and detail is reached by zooming the view.
 *
 * Not production code. Phase 2 lands this behind the real timeline entry point
 * with selection, playhead and the resizable gutter kept working.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, Maximize2, Minus, Plus } from "lucide-react";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { cn } from "@/src/utils/tailwind";
import {
  detectPointerModality,
  resolveDensity,
  type PointerModality,
} from "./density";
import {
  formatDurationMs,
  layout,
  prepareTimeline,
  timeCompressionFor,
  type LayoutNode,
  type PositionedNode,
} from "./layout";
import { createTextMeasurer } from "./textMeasurer";
import {
  fitView,
  isFitted,
  panView,
  traceSpaceOf,
  zoomToSpan,
  zoomView,
  type Box,
  type TimeSpan,
} from "./viewTransform";

/**
 * The four takes on "what happens to the name gutter below ~480px", so the
 * design call can be made from renders instead of prose.
 */
export type TimelineComposition =
  /** Name gutter beside the chart, as today. */
  | "split"
  /** Gutter collapses to the type icon and the depth rail. */
  | "icons"
  /** No gutter: names ride on top of the bars. */
  | "overlay"
  /** No gutter: name above, bar below, both full width. */
  | "stacked"
  /** Full-width tree or full-width timeline, one at a time. */
  | "modes";

export type TimelineV2Props = {
  roots: LayoutNode[];
  /** The measured box. Required — there is no fallback canvas width. */
  box: Box;
  /** `null` resolves from `(pointer: coarse)` once, on mount. */
  pointer: PointerModality | null;
  compress: boolean;
  composition: TimelineComposition;
  /** View window + scale readout under the chart; the spike's instrument panel. */
  showReadout: boolean;
};

const FRAME_BORDER = 1;
const TOOLBAR_HEIGHT = 30;
const AXIS_HEIGHT = 20;
const READOUT_HEIGHT = 18;
const GUTTER_INDENT = 10;
const GUTTER_MAX_DEPTH = 6;
const ICON_GUTTER_WIDTH = 46;
const ZOOM_STEP = 1.6;
/** Movement before a press becomes a pan rather than a click. */
const DRAG_THRESHOLD_PX = 4;

export function TimelineV2({
  roots,
  box,
  pointer,
  compress,
  composition,
  showReadout,
}: TimelineV2Props) {
  const [detectedPointer] = useState(detectPointerModality);
  const [view, setView] = useState<TimeSpan | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"tree" | "timeline">("timeline");

  const modality = pointer ?? detectedPointer;
  const prepared = useMemo(
    () => prepareTimeline(roots, collapsed),
    [roots, collapsed],
  );

  // The scroll viewport's own client box, not an arithmetic guess at it. The
  // guess was wrong by the frame border and again by the scrollbar — two
  // constants the math would never have seen, which is the whole failure mode
  // this renderer exists to remove. Measure first; everything below derives.
  const [viewport, setViewport] = useState<Box | null>(null);
  const estimated = {
    width: Math.max(box.width - FRAME_BORDER * 2, 0),
    height: Math.max(
      box.height -
        FRAME_BORDER * 2 -
        TOOLBAR_HEIGHT -
        AXIS_HEIGHT -
        (showReadout ? READOUT_HEIGHT : 0),
      0,
    ),
  };
  const contentWidth = viewport?.width ?? estimated.width;
  const viewportHeight = viewport?.height ?? estimated.height;

  const gutterWidth = resolveGutterWidth({ composition, contentWidth, mode });
  const chartWidth = Math.max(contentWidth - gutterWidth, 0);
  const chartBox = useMemo(
    () => ({ width: chartWidth, height: viewportHeight }),
    [chartWidth, viewportHeight],
  );

  const density = useMemo(
    () =>
      resolveDensity({
        pointer: modality,
        lines: composition === "stacked" ? 2 : 1,
      }),
    [modality, composition],
  );
  const measurer = useMemo(
    () => createTextMeasurer(`${density.labelFontPx}px ui-sans-serif`),
    [density.labelFontPx],
  );
  const compression = useMemo(
    () => timeCompressionFor(prepared, chartBox, compress),
    [prepared, chartBox, compress],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: prepared.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => density.rowHeight,
    overscan: 6,
    // Key by node id, not index: an index-keyed cache and id-keyed DOM drift
    // apart the moment rows are collapsed away.
    getItemKey: (index) => prepared.rows[index]?.node.id ?? index,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const rowRange = virtualItems.length
    ? {
        startIndex: virtualItems[0]!.index,
        endIndex: virtualItems[virtualItems.length - 1]!.index,
      }
    : // Before the virtualizer has measured its scroll element, fill the box.
      {
        startIndex: 0,
        endIndex: Math.ceil(viewportHeight / density.rowHeight) + 1,
      };

  const result = layout({
    roots,
    box: chartBox,
    density,
    measurer,
    view,
    compress,
    prepared,
    compression,
    rowRange,
  });

  const traceSpace = useMemo(
    () => traceSpaceOf(compression.compressedDurationMs),
    [compression.compressedDurationMs],
  );
  const fitted = isFitted(result.view, traceSpace);
  const viewStartMs = compression.toRealMs(result.view.start);
  const viewEndMs = compression.toRealMs(
    result.view.start + result.view.duration,
  );

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

  /**
   * `deltaPx` is how far the CONTENT moves, so the grabbed moment stays under
   * the pointer: dragging right shows earlier time, which means the window start
   * goes DOWN. Without the negation the bars slid the opposite way to the finger
   * — and to the wheel, whose caller negates the scroll delta for the same
   * reason.
   */
  const panBy = useCallback(
    (deltaPx: number) =>
      setView((current) => {
        const from = current ?? fitView(traceSpace);
        const pxPerMs = chartWidth > 0 ? chartWidth / from.duration : 0;
        return panView(from, traceSpace, pxPerMs > 0 ? -deltaPx / pxPerMs : 0);
      }),
    [traceSpace, chartWidth],
  );

  /**
   * The viewport ref does two things React cannot express declaratively: a
   * non-passive wheel listener (React's own onWheel is passive, so it cannot
   * stop the page scrolling during a zoom) and a ResizeObserver for the
   * measured box. Both are external browser systems, wired through React 19's
   * ref cleanup rather than an effect.
   */
  const attachViewport = useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = element;
      if (!element) return;

      const measure = () =>
        setViewport((current) =>
          current?.width === element.clientWidth &&
          current?.height === element.clientHeight
            ? current
            : { width: element.clientWidth, height: element.clientHeight },
        );
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      measure();

      const onWheel = (event: WheelEvent) => {
        const zooming = event.ctrlKey || event.metaKey;
        const panning = !zooming && (event.shiftKey || event.deltaX !== 0);
        if (!zooming && !panning) return; // plain wheel scrolls the row list

        event.preventDefault();
        if (zooming) {
          const rect = element.getBoundingClientRect();
          const anchorRatio =
            chartWidth > 0
              ? (event.clientX - rect.left - gutterWidth) / chartWidth
              : 0.5;
          zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, anchorRatio);
        } else {
          panBy(-(event.deltaX || event.deltaY));
        }
      };

      element.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        observer.disconnect();
        element.removeEventListener("wheel", onWheel);
      };
    },
    [chartWidth, gutterWidth, zoomBy, panBy],
  );

  const gesture = useRef<{
    pointers: Map<number, number>;
    startX: number;
    lastX: number;
    pinchDistance: number;
    dragging: boolean;
  }>({
    pointers: new Map(),
    startX: 0,
    lastX: 0,
    pinchDistance: 0,
    dragging: false,
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    gesture.current.pointers.set(event.pointerId, event.clientX);
    gesture.current.startX = event.clientX;
    gesture.current.lastX = event.clientX;
    gesture.current.dragging = false;
    if (gesture.current.pointers.size === 2) {
      const [a, b] = [...gesture.current.pointers.values()];
      gesture.current.pinchDistance = Math.abs((a ?? 0) - (b ?? 0));
    }
    // Deliberately NOT capturing here. Pointer capture retargets the derived
    // `click` to the capture element, so capturing on pointerdown means a plain
    // click lands on this scroll container and no row is ever selected.
    // Capture is taken on the first move past DRAG_THRESHOLD_PX instead, which
    // also gives us "a drag does not select" for free.
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = gesture.current;
    if (!state.pointers.has(event.pointerId)) return;
    state.pointers.set(event.pointerId, event.clientX);

    if (state.pointers.size >= 2) {
      const [a, b] = [...state.pointers.values()];
      const distance = Math.abs((a ?? 0) - (b ?? 0));
      if (state.pinchDistance > 0 && distance > 0) {
        const rect = event.currentTarget.getBoundingClientRect();
        const midpoint = ((a ?? 0) + (b ?? 0)) / 2 - rect.left - gutterWidth;
        zoomBy(
          distance / state.pinchDistance,
          chartWidth > 0 ? midpoint / chartWidth : 0.5,
        );
      }
      state.pinchDistance = distance;
      return;
    }

    if (!state.dragging) {
      if (Math.abs(event.clientX - state.startX) < DRAG_THRESHOLD_PX) return;
      state.dragging = true;
      // Now that this really is a drag, capture so it survives leaving the box.
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    panBy(event.clientX - state.lastX);
    state.lastX = event.clientX;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = gesture.current;
    state.pointers.delete(event.pointerId);
    state.pinchDistance = 0;
    state.dragging = false;
    // Lifting one finger of a pinch does not end the gesture, and startX/lastX
    // still hold where the OTHER finger went down — so the survivor's next small
    // move would clear the drag threshold at once and pan by the whole finger
    // separation. Re-anchor both on the finger that is still there.
    const survivor = state.pointers.values().next().value;
    if (survivor !== undefined) {
      state.startX = survivor;
      state.lastX = survivor;
    }
  };

  const toggleCollapsed = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Double-tap a bar to fit it; double-tap again to go back to the whole trace. */
  const zoomToNode = (node: PositionedNode) => {
    const target = {
      start: compression.toCompressedMs(node.startMs),
      duration: Math.max(
        compression.toCompressedMs(node.endMs) -
          compression.toCompressedMs(node.startMs),
        0,
      ),
    };
    setView((current) => {
      const next = zoomToSpan(target, traceSpace);
      const isAlreadyThere =
        current != null &&
        Math.abs(current.start - next.start) < 1 &&
        Math.abs(current.duration - next.duration) < 1;
      return isAlreadyThere ? null : next;
    });
  };

  const showGutter = gutterWidth > 0;
  const showChart = chartWidth > 0;

  return (
    <div
      className="bg-background border-border text-foreground flex flex-col overflow-hidden rounded border"
      style={{ width: `${box.width}px`, height: `${box.height}px` }}
    >
      <div
        className="border-border flex shrink-0 items-center gap-1 border-b px-1"
        style={{ height: `${TOOLBAR_HEIGHT}px` }}
      >
        {composition === "modes" ? (
          <div className="flex gap-0.5">
            {(["tree", "timeline"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setMode(candidate)}
                className={cn(
                  "rounded px-2 py-0.5 text-xs capitalize",
                  mode === candidate ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                {candidate}
              </button>
            ))}
          </div>
        ) : null}
        <ToolbarButton
          label="Zoom out"
          onClick={() => zoomBy(1 / ZOOM_STEP, 0.5)}
        >
          <Minus className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton label="Zoom in" onClick={() => zoomBy(ZOOM_STEP, 0.5)}>
          <Plus className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton label="Fit whole trace" onClick={() => setView(null)}>
          <Maximize2 className="h-3 w-3" />
        </ToolbarButton>
        <span
          className="text-muted-foreground truncate text-xs"
          title="Zoom state"
        >
          {fitted
            ? "whole trace"
            : `${formatDurationMs(viewEndMs - viewStartMs)} window`}
        </span>
      </div>

      <div
        className="border-border relative shrink-0 border-b"
        style={{ height: `${AXIS_HEIGHT}px` }}
      >
        {showChart ? (
          <div
            className="absolute inset-y-0"
            style={{ left: `${gutterWidth}px`, width: `${chartWidth}px` }}
          >
            {result.ticks.map((tick) => (
              <div
                key={tick.realMs}
                className="border-border-contrast absolute inset-y-0 border-l"
                style={{ left: `${tick.x}px` }}
              >
                <span
                  className="text-muted-foreground absolute top-0.5 left-1 whitespace-nowrap"
                  style={{ fontSize: `${density.labelFontPx - 1}px` }}
                >
                  {tick.label}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1">
        {showChart ? (
          <div
            className="pointer-events-none absolute inset-y-0"
            style={{ left: `${gutterWidth}px`, width: `${chartWidth}px` }}
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
                className="bg-muted border-border-contrast absolute inset-y-0 flex items-center justify-center border-x border-dashed"
                style={{ left: `${gap.x}px`, width: `${gap.width}px` }}
                title={`${gap.label} of idle time, collapsed`}
              >
                <span
                  className="text-muted-foreground"
                  style={{ fontSize: `${density.labelFontPx}px` }}
                >
                  ⋯
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div
          ref={attachViewport}
          className="h-full overflow-x-hidden overflow-y-auto"
          data-testid="timeline-v2-scroll"
          style={{ touchAction: "pan-y" }}
          onPointerDown={showChart ? onPointerDown : undefined}
          onPointerMove={showChart ? onPointerMove : undefined}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="relative"
            style={{ height: `${result.contentHeight}px` }}
            data-testid="timeline-v2-content"
          >
            {result.nodes.map((node) => (
              <div
                key={node.id}
                className={cn(
                  // select-none: the whole row is a click target (select, and
                  // double-click to fit), so dragging over it must not select
                  // the names and duration labels it is made of.
                  // `group` so hovering anywhere in the row recolours its bar.
                  // transition-COLORS only — a bare `transition` would also ease
                  // left/width and make zoom lag a frame behind the gesture.
                  "group absolute inset-x-0 flex cursor-pointer items-center transition-colors duration-150 select-none",
                  // Selected takes an accent tint rather than a deeper neutral:
                  // the bars are bg-muted, so a neutral selected row swallows
                  // them. Hover is the neutral one.
                  selectedId === node.id
                    ? "bg-primary-accent/10"
                    : "hover:bg-muted",
                )}
                style={{ top: `${node.y}px`, height: `${node.height}px` }}
                onClick={() => setSelectedId(node.id)}
                onDoubleClick={() => zoomToNode(node)}
              >
                {selectedId === node.id ? (
                  <div className="bg-primary-accent absolute inset-y-0 left-0 w-0.5" />
                ) : null}
                {showGutter ? (
                  <GutterCell
                    node={node}
                    width={gutterWidth}
                    compact={composition === "icons"}
                    fontPx={density.labelFontPx}
                    isSelected={selectedId === node.id}
                    onToggleCollapsed={() => toggleCollapsed(node.id)}
                  />
                ) : null}
                {showChart ? (
                  <ChartCell
                    node={node}
                    width={chartWidth}
                    barHeight={density.barHeight}
                    fontPx={density.labelFontPx}
                    nameMode={
                      composition === "overlay"
                        ? "overlay"
                        : composition === "stacked"
                          ? "stacked"
                          : "none"
                    }
                    isSelected={selectedId === node.id}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showReadout ? (
        <div
          className="border-border text-muted-foreground flex shrink-0 items-center gap-2 overflow-hidden border-t px-1 whitespace-nowrap"
          style={{ height: `${READOUT_HEIGHT}px`, fontSize: "10px" }}
          data-testid="timeline-v2-readout"
        >
          <span>
            {box.width}×{box.height} · gutter {gutterWidth} · lane {chartWidth}
          </span>
          <span>
            view {formatDurationMs(viewStartMs)}–{formatDurationMs(viewEndMs)}
          </span>
          <span>{result.pxPerMs.toFixed(3)} px/ms</span>
          <span>
            {result.rowCount} rows @ {density.rowHeight}px ({modality})
          </span>
          {compression.enabled ? (
            <span>{compression.gaps.length} gaps collapsed</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function resolveGutterWidth(args: {
  composition: TimelineComposition;
  contentWidth: number;
  mode: "tree" | "timeline";
}): number {
  const { composition, contentWidth, mode } = args;
  if (composition === "overlay" || composition === "stacked") return 0;
  if (composition === "icons") return Math.min(ICON_GUTTER_WIDTH, contentWidth);
  if (composition === "modes") return mode === "tree" ? contentWidth : 0;
  return Math.round(Math.min(Math.max(contentWidth * 0.4, 96), 280));
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
      className="hover:bg-muted flex h-5 w-5 items-center justify-center rounded"
    >
      {children}
    </button>
  );
}

function GutterCell({
  node,
  width,
  compact,
  fontPx,
  isSelected,
  onToggleCollapsed,
}: {
  node: PositionedNode;
  width: number;
  compact: boolean;
  fontPx: number;
  isSelected: boolean;
  onToggleCollapsed: () => void;
}) {
  // Depth indentation is capped so a 20-level trace still leaves room for names.
  const indent = Math.min(node.depth, GUTTER_MAX_DEPTH) * GUTTER_INDENT;

  return (
    <div
      className="flex h-full shrink-0 items-center gap-1 overflow-hidden pr-1"
      style={{ width: `${width}px`, paddingLeft: `${indent + 2}px` }}
    >
      {node.hasChildren ? (
        <button
          type="button"
          aria-label={node.isCollapsed ? "Expand" : "Collapse"}
          aria-expanded={!node.isCollapsed}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapsed();
          }}
          // The row zooms to its span on double-click. Collapsing twice in
          // quick succession is a no-op the user cannot see, so without this the
          // only visible outcome of an impatient click is the view jumping.
          onDoubleClick={(event) => event.stopPropagation()}
          className="hover:bg-muted-foreground/10 flex h-4 w-4 shrink-0 items-center justify-center rounded"
        >
          <ChevronRight
            className={cn("h-3 w-3", !node.isCollapsed && "rotate-90")}
          />
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <span className="shrink-0">
        <ItemBadge type={node.type as LangfuseItemType} isSmall />
      </span>
      {compact ? null : (
        <span
          className={cn("truncate", isSelected && "font-bold")}
          style={{ fontSize: `${fontPx}px` }}
          title={node.name}
        >
          {node.name}
        </span>
      )}
    </div>
  );
}

function ChartCell({
  node,
  width,
  barHeight,
  fontPx,
  nameMode,
  isSelected,
}: {
  node: PositionedNode;
  width: number;
  barHeight: number;
  fontPx: number;
  nameMode: "none" | "overlay" | "stacked";
  isSelected: boolean;
}) {
  return (
    <div
      className="relative h-full shrink-0 overflow-hidden"
      style={{ width: `${width}px` }}
      data-testid="timeline-v2-lane"
    >
      {node.offscreen ? null : (
        <>
          <div
            className={cn(
              "absolute border transition-colors duration-150",
              nameMode === "stacked" ? "bottom-1" : "top-1/2 -translate-y-1/2",
              node.durationMs == null && "border-dashed",
              !node.clippedLeft && "rounded-l-sm",
              !node.clippedRight && "rounded-r-sm",
              // The bar itself takes the focus colour on row hover, and a
              // stronger fill plus a ring when the row is the selected one.
              isSelected
                ? "bg-primary-accent/40 border-primary-accent ring-primary-accent ring-2"
                : "bg-muted border-border group-hover:bg-primary-accent/25 group-hover:border-primary-accent/40",
            )}
            style={{
              left: `${node.x}px`,
              width: `${node.width}px`,
              height: `${barHeight}px`,
            }}
            data-testid="timeline-v2-bar"
          />
          {node.firstTokenX == null ? null : (
            <div
              className={cn(
                "bg-border-contrast absolute w-px",
                nameMode === "stacked"
                  ? "bottom-1"
                  : "top-1/2 -translate-y-1/2",
              )}
              style={{
                left: `${node.firstTokenX}px`,
                height: `${barHeight}px`,
              }}
              title="Time to first token"
            />
          )}
          {node.labelPlacement === "hidden" ? null : (
            <span
              className={cn(
                "absolute whitespace-nowrap",
                nameMode === "stacked"
                  ? "bottom-1"
                  : "top-1/2 -translate-y-1/2",
                node.labelPlacement === "inside"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
              style={{
                left: `${node.labelX}px`,
                maxWidth: `${Math.max(width - node.labelX, 0)}px`,
                fontSize: `${fontPx}px`,
              }}
            >
              {node.label}
            </span>
          )}
        </>
      )}
      {nameMode === "overlay" ? (
        // Names ride over the bars: a gradient keeps them readable without
        // stealing a column from the chart.
        <span
          className="from-background via-background/90 pointer-events-none absolute top-1/2 left-1 max-w-[70%] -translate-y-1/2 truncate bg-gradient-to-r to-transparent pr-3"
          style={{ fontSize: `${fontPx}px` }}
          title={node.name}
        >
          {node.name}
        </span>
      ) : null}
      {nameMode === "stacked" ? (
        // Name above, bar below: the chart keeps the full width and the name
        // keeps its full length, at the cost of a taller row.
        <span
          className="text-foreground pointer-events-none absolute top-0 right-1 truncate"
          style={{
            left: `${Math.min(node.depth, GUTTER_MAX_DEPTH) * GUTTER_INDENT + 4}px`,
            fontSize: `${fontPx}px`,
          }}
          title={node.name}
        >
          {node.name}
        </span>
      ) : null}
    </div>
  );
}
