/**
 * TraceTimeline - Gantt waterfall: a fixed name-gutter + a scrollable chart.
 *
 * Two panes, side by side, sharing the virtualized rows:
 *  - Gutter pane (fixed, resizable): the indented name tree. It never scrolls
 *    itself — its content is a one-way translateY projection of the chart's
 *    vertical scroll, so the two panes can't drift; wheeling or touch-dragging
 *    over it drives the chart.
 *  - Chart pane (flex-1): the gantt bars. Owns the only (vertical) scrollbar and
 *    is the virtualizer's scroll element.
 *
 * The chart NEVER scrolls horizontally. Its measured client width is the scale
 * basis, so the whole trace is fitted into the lane the user actually has, at
 * any size — every coordinate comes from the pure layout() in fns/timeline,
 * which clamps bars, labels and ticks inside that lane. The previous design
 * scaled against a hard-coded 900px canvas and let the container scroll, which
 * put part of the trace off-screen in any narrower lane.
 *
 * Playback: the engine (RAF loop, transport) lives in the shared playhead
 * store (contexts/playheadStore.ts); the transport buttons live in the
 * navigation header (PlaybackControls). This file only draws the vertical
 * playhead line + scrub handle (useTimelinePlayhead) and glows the active rows
 * (each row shell subscribes to its own flag — see TimelineRows.tsx).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import {
  usePlayhead,
  useShowPlayhead,
} from "@/src/features/traces/contexts/PlayheadContext";
import { useHandlePrefetchObservation } from "@/src/features/traces/hooks/useHandlePrefetchObservation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useTraceAnalyticsDimensions } from "@/src/features/traces/hooks/useTraceAnalyticsDimensions";
import { computeSelectionScrollTarget } from "../../fns/timelineCalculations";
import {
  layout as computeTimelineLayout,
  prepareTimeline,
} from "../../fns/timeline/layout";
import { resolveDensity } from "../../fns/timeline/density";
import { createTextMeasurer } from "../../fns/timeline/textMeasurer";
import { TimelineScale } from "./TimelineScale";
import { TimelineChartRowShell, TimelineGutterRowShell } from "./TimelineRows";
import {
  computeMaxVisualDepth,
  GUTTER_VISUAL_DEPTH,
} from "../../fns/visualDepth";
import { useDesktopLayoutContextOptional } from "../TraceLayoutDesktop";
import { useMobileLayoutContextOptional } from "../TraceLayoutMobile";
import { type TreeNode } from "../../types/treeNode";
import { cn } from "@/src/utils/tailwind";

// Width of the left name gutter. Resizable; these bound it. Kept slim so the
// waterfall (the point of the timeline) gets the central space.
const GUTTER_WIDTH_DEFAULT = 200;
const GUTTER_WIDTH_MIN = 160;
const GUTTER_WIDTH_MAX = 560;
// Dense waterfall rows (LFE-10539): the 16px bar / 16px name chip sit centered
// with ~5px of breathing room. Resolved once here so the virtualizer estimate
// and the rendered row height cannot drift. Touch density is Phase 4's job, so
// this pins the fine-pointer value.
const DENSITY = resolveDensity({ pointer: "fine" });
const ROW_HEIGHT = DENSITY.rowHeight;

const EMPTY_SCORES: never[] = [];

/**
 * Wire a window-level drag gesture: move events flow to `onMove` until
 * pointerup — and pointercancel (OS gesture, contextmenu, touch interruption),
 * which must also tear down the listener, else the drag ghosts on afterwards.
 * One helper for all three drag sites (gutter resize, scale scrub, handle
 * scrub) so future fixes land once.
 */
function startWindowDrag(onMove: (ev: PointerEvent) => void) {
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

/**
 * The timeline's playhead surface: maps the shared engine onto gantt
 * coordinates. Owns the line/handle refs, the imperative position feed
 * (transforms + slider ARIA + follow-scroll while playing — no React state at
 * 60fps), and the scrub gestures (scale click-drag, handle drag, handle
 * keyboard).
 */
function useTimelinePlayhead({
  traceDuration,
  secToX,
  xToSec,
}: {
  traceDuration: number;
  /** Seconds from the trace origin → px in the chart lane. */
  secToX: (sec: number) => number;
  /** px in the chart lane → seconds from the trace origin. */
  xToSec: (px: number) => number;
}) {
  const { seekToSec, pause, getPlayheadSec, subscribePosition } = usePlayhead();
  const showPlayhead = useShowPlayhead();

  const scaleOuterRef = useRef<HTMLDivElement>(null);
  const playheadLineRef = useRef<HTMLDivElement>(null);
  const playheadHandleRef = useRef<HTMLDivElement>(null);

  // Position the line + handle imperatively off the engine's position feed (no
  // re-render). They only exist while showPlayhead; re-subscribe when the
  // scale (secToX) changes so the mapping stays correct.
  useEffect(() => {
    if (!showPlayhead) return;
    const apply = (sec: number) => {
      const t = `translateX(${secToX(sec)}px)`;
      if (playheadLineRef.current) playheadLineRef.current.style.transform = t;
      const handle = playheadHandleRef.current;
      if (handle) {
        handle.style.transform = t;
        // Slider semantics for assistive tech, updated on the same feed.
        handle.setAttribute("aria-valuenow", sec.toFixed(2));
        handle.setAttribute("aria-valuetext", `${sec.toFixed(2)} seconds`);
      }
      // No follow-scroll: the whole trace is fitted into the lane, so the
      // playhead cannot sweep out of view.
    };
    apply(getPlayheadSec());
    return subscribePosition(apply);
  }, [showPlayhead, secToX, getPlayheadSec, subscribePosition]);

  // Translate a pointer x on the scale into a seek (places/moves the playhead).
  // The scale shares the chart lane's coordinate space and neither scrolls, so
  // the offset from the strip's left edge IS the lane x.
  const seekFromClientX = useCallback(
    (clientX: number) => {
      const outer = scaleOuterRef.current;
      if (!outer || traceDuration <= 0) return;
      seekToSec(xToSec(clientX - outer.getBoundingClientRect().left));
    },
    [traceDuration, seekToSec, xToSec],
  );

  const handleScalePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault(); // don't start a text selection on the scale labels
      seekFromClientX(e.clientX); // seekToSec pauses + shows the playhead
      // Click-and-drag on the scale scrubs in one gesture.
      startWindowDrag((ev) => seekFromClientX(ev.clientX));
    },
    [seekFromClientX],
  );

  const handleHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Grab the handle to scrub without re-seeking to the click x.
      e.preventDefault();
      e.stopPropagation();
      pause();
      startWindowDrag((ev) => seekFromClientX(ev.clientX));
    },
    [pause, seekFromClientX],
  );

  // Keyboard seek on the handle: ←/→ nudge by 1% of the trace, Home/End jump.
  const handleHandleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next: number | null = null;
      if (e.key === "ArrowLeft") next = getPlayheadSec() - traceDuration / 100;
      else if (e.key === "ArrowRight")
        next = getPlayheadSec() + traceDuration / 100;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = traceDuration;
      if (next == null) return;
      e.preventDefault();
      seekToSec(next);
    },
    [traceDuration, getPlayheadSec, seekToSec],
  );

  return {
    scaleOuterRef,
    playheadLineRef,
    playheadHandleRef,
    showPlayhead,
    secToX,
    getPlayheadSec,
    handleScalePointerDown,
    handleHandlePointerDown,
    handleHandleKeyDown,
  };
}

export function TraceTimeline() {
  const {
    roots,
    serverScores: scores,
    traceLevelScoreOwnerIds,
    comments,
    traceDuration,
  } = useTraceData();
  const { collapsedNodes, toggleCollapsed, selectedNodeId, setSelectedNodeId } =
    useSelection();
  const {
    showDuration,
    showCostTokens,
    showScores,
    showComments,
    colorCodeMetrics,
  } = useViewPreferences();
  const { handleHover } = useHandlePrefetchObservation();
  const capture = usePostHogClientCapture();
  const analyticsDimensions = useTraceAnalyticsDimensions();
  // Optional (null in the mobile layout): reopen the detail panel on select.
  const layout = useDesktopLayoutContextOptional();
  // Optional (null on desktop): its presence also means the timeline is
  // rendered inside a narrow mobile tab, and selecting jumps to the Info tab.
  const mobileLayout = useMobileLayoutContextOptional();

  // The chart is the single vertical scroller; the gutter content is a one-way
  // transform projection of it (gutterInnerRef), so the two panes can't drift.
  const gutterInnerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // Hovered row, lifted to shared state so hovering either pane highlights the
  // whole row (caption + chart), which CSS :hover can't do across two panes.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Resizable name gutter so users can trade name space for chart space. On
  // mobile the timeline lives in a narrow tab, so start the gutter at its MIN
  // and let the waterfall (the point of the timeline) claim the rest — the
  // chart pane keeps its own horizontal scroll, so the bars scroll within the
  // tab instead of overflowing the page.
  const [gutterWidth, setGutterWidth] = useState(() =>
    mobileLayout ? GUTTER_WIDTH_MIN : GUTTER_WIDTH_DEFAULT,
  );
  const startGutterResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = gutterWidth;
      startWindowDrag((ev) => {
        const next = startWidth + (ev.clientX - startX);
        setGutterWidth(
          Math.min(GUTTER_WIDTH_MAX, Math.max(GUTTER_WIDTH_MIN, next)),
        );
      });
    },
    [gutterWidth],
  );

  // Cap gutter indentation to the gutter width so extremely deep traces (a
  // reported one chained ~1400 levels) keep names readable instead of
  // clipping into nothing (LFE-10959).
  const gutterMaxVisualDepth = computeMaxVisualDepth(
    gutterWidth,
    GUTTER_VISUAL_DEPTH,
  );

  // Tree walk, memoized on the tree + collapsed set: it is the one expensive
  // part and it must stay out of the resize/render path.
  const prepared = useMemo(
    () => prepareTimeline(roots, collapsedNodes),
    [roots, collapsedNodes],
  );

  // Canvas glyph widths, measured once, so layout() can decide whether a
  // duration label fits inside its bar.
  const measurer = useMemo(() => createTextMeasurer(), []);

  // Virtualizer drives off the chart pane; the gutter mirrors its vertical scroll.
  // overscan is a ROW COUNT (not px): keep it small so a long trace re-renders
  // only a few dozen rows per scroll step instead of ~1000 (the old "500" — a
  // px-vs-items mix-up — made big traces stutter). ~16 rows ≈ half a viewport of
  // headroom, enough to avoid blank rows on a normal scroll.
  const rowVirtualizer = useVirtualizer({
    count: prepared.rows.length,
    getScrollElement: () => chartRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
    // Key by node id: an index-keyed measurement cache and an id-keyed DOM
    // drift apart the moment a collapse changes what index a row holds.
    getItemKey: (index) => prepared.rows[index]?.node.id ?? index,
  });

  // Scroll the selected row into view whenever the selection changes — so
  // selecting a node elsewhere (e.g. clicking it in the graph view) brings the
  // matching timeline row into view. Math lives in computeSelectionScrollTarget
  // (pure, tested); both axes go through ONE scrollTo (two competing smooth
  // animations on the same element clobber each other).
  const prevSelectedIdRef = useRef<string | null | undefined>(undefined);

  useLayoutEffect(() => {
    if (!selectedNodeId || selectedNodeId === prevSelectedIdRef.current) {
      prevSelectedIdRef.current = selectedNodeId;
      return;
    }

    const index = prepared.rows.findIndex(
      (row) => row.node.id === selectedNodeId,
    );
    // Keep the scroll PENDING when the row is missing (collapsed subtree,
    // level filter) — the ref stays un-advanced, so this retries when
    // prepared.rows changes and the row appears.
    if (index === -1) return;
    const chart = chartRef.current;
    if (!chart) return;

    const isInitial = prevSelectedIdRef.current === undefined;
    prevSelectedIdRef.current = selectedNodeId;

    // Vertical only: the whole trace is fitted into the lane, so a selected bar
    // is never off to the side. Reaching detail is zoom's job (Phase 3).
    const { top } = computeSelectionScrollTarget({
      index,
      rowHeight: ROW_HEIGHT,
      scrollTop: chart.scrollTop,
      clientHeight: chart.clientHeight,
      isInitial,
    });

    chart.scrollTo({ top, behavior: isInitial ? "auto" : "smooth" });
  }, [selectedNodeId, prepared]);

  // The chart owns the only scroll. The gutter is a one-way projection of it
  // (translateY) updated in the same scroll frame — no second scroll container
  // to fight the chart's momentum, which is what made the two panes drift
  // apart. The scale needs no projection: nothing scrolls horizontally.
  const handleChartScroll = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (gutterInnerRef.current) {
      gutterInnerRef.current.style.transform = `translateY(${-chart.scrollTop}px)`;
    }
  }, []);

  // The gutter doesn't scroll itself; wheeling over it drives the chart, which
  // then projects back onto the gutter via handleChartScroll. Normalize the
  // delta to pixels first: Firefox (and classic mouse wheels) report deltaMode
  // in lines (1) or pages (2), not pixels (0) — without this, a line-mode wheel
  // moves ~1px per notch and the gutter feels stuck.
  const handleGutterWheel = useCallback((e: React.WheelEvent) => {
    const chart = chartRef.current;
    if (!chart) return;
    const unit =
      e.deltaMode === 1
        ? ROW_HEIGHT
        : e.deltaMode === 2
          ? chart.clientHeight
          : 1;
    chart.scrollTop += e.deltaY * unit;
  }, []);

  // Touch (and pen/mouse drag) over the gutter scrolls it too. WheelEvents are
  // never synthesized on touch, so on touch-capable screens that render this
  // desktop layout the wheel handler alone leaves the gutter stuck. Pointer
  // events cover touch + pen + mouse uniformly: we drag-scroll the chart (move
  // a finger up → content scrolls up, so scrollTop -= dy), and the chart
  // projects straight back onto the gutter via handleChartScroll — same
  // pixel-locked path as the wheel, so the two panes still can't drift.
  const dragRef = useRef<{ pointerId: number; lastY: number } | null>(null);
  const handleGutterPointerDown = useCallback((e: React.PointerEvent) => {
    // Only drag-scroll for touch/pen. Leave the mouse to clicks (rows are
    // clickable) and the wheel; a mouse drag here would otherwise hijack
    // text selection / row clicks.
    if (e.pointerType === "mouse") return;
    const chart = chartRef.current;
    if (!chart) return;
    dragRef.current = { pointerId: e.pointerId, lastY: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const handleGutterPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    const chart = chartRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !chart) return;
    // Clamp-aware: only consume the scroll delta the browser actually applied.
    // The browser clamps scrollTop to [0, maxScroll], so advancing lastY to
    // e.clientY unconditionally would record finger motion past a boundary that
    // scrollTop discarded; a later direction reversal would then resurface as
    // phantom scroll with zero net finger travel. Advancing lastY by only the
    // applied delta keeps over-the-boundary motion from leaking back in.
    const prev = chart.scrollTop;
    chart.scrollTop -= e.clientY - drag.lastY;
    drag.lastY += prev - chart.scrollTop;
  }, []);
  const handleGutterPointerEnd = useCallback((e: React.PointerEvent) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  // Parent totals for heatmap coloring (aggregate across all roots).
  const parentTotalCost = useMemo(() => {
    return roots.reduce(
      (acc, r) => {
        if (!r.totalCost) return acc;
        return acc ? acc.plus(r.totalCost) : r.totalCost;
      },
      undefined as (typeof roots)[0]["totalCost"],
    );
  }, [roots]);
  // MILLISECONDS: TimelineBar heat-maps ownDurationMs against this max, and
  // the tree path (TraceTree rootTotalDuration) is ms too. traceDuration is
  // seconds — passing it raw inflated the heat ratio ×1000, painting every
  // duration label dark red.
  const parentTotalDuration = traceDuration * 1000;

  // Score lookup keyed by tree-node id: one pass over the scores instead of an
  // O(scores) filter per row per render. Trace-level scores land on their owner
  // node(s) — the TRACE row, or every top-level span when there is none — so the
  // timeline badge matches the tree badge and the node's Scores tab.
  const scoresByNodeId = useMemo(() => {
    const byNode = new Map<string, typeof scores>();
    const pushTo = (key: string, score: (typeof scores)[number]) => {
      const arr = byNode.get(key);
      if (arr) arr.push(score);
      else byNode.set(key, [score]);
    };
    for (const score of scores) {
      if (score.observationId) {
        pushTo(score.observationId, score);
      } else {
        for (const ownerId of traceLevelScoreOwnerIds) {
          pushTo(ownerId, score);
        }
      }
    }
    return byNode;
  }, [scores, traceLevelScoreOwnerIds]);

  const totalSize = rowVirtualizer.getTotalSize();
  const virtualItems = rowVirtualizer.getVirtualItems();

  // THE measurement. The chart pane's own client box is the scale basis, and it
  // must be the box of the element that SCROLLS: its border and its vertical
  // scrollbar (~15px on Windows/Linux, 0 with macOS overlay bars) both take
  // width that an arithmetic guess from the container would miss, and any such
  // miss is a lane wider than the space available — which is horizontal scroll,
  // the thing this design removes. `scrollbarWidth` is reported separately so
  // the scale strip, which has no scrollbar of its own, can reserve the same
  // gutter and stay aligned with the bars.
  const [chartBox, setChartBox] = useState({
    width: 0,
    height: 0,
    scrollbarWidth: 0,
  });
  useLayoutEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const measure = () => {
      const next = {
        width: el.clientWidth,
        height: el.clientHeight,
        scrollbarWidth: el.offsetWidth - el.clientWidth,
      };
      // Only re-render when the measurement actually changes — the observer
      // fires on every content resize, but the box rarely moves.
      setChartBox((prev) =>
        prev.width === next.width &&
        prev.height === next.height &&
        prev.scrollbarWidth === next.scrollbarWidth
          ? prev
          : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [totalSize, gutterWidth]);

  // One pure call owns every coordinate on screen, for the mounted rows only.
  // The view is the whole trace: zoom/pan is Phase 3, and until then
  // "fit to the measured box" is the only view there is.
  const chartLayout = computeTimelineLayout({
    roots,
    box: { width: chartBox.width, height: chartBox.height },
    density: DENSITY,
    measurer,
    view: null,
    compress: false,
    prepared,
    rowRange: virtualItems.length
      ? {
          startIndex: virtualItems[0]!.index,
          endIndex: virtualItems[virtualItems.length - 1]!.index,
        }
      : // Before the virtualizer has measured its scroll element, fill the box.
        {
          startIndex: 0,
          endIndex: Math.ceil(chartBox.height / ROW_HEIGHT) + 1,
        },
  });

  // Playhead ↔ lane mapping, in the same space as the bars and the ticks.
  const { pxPerMs } = chartLayout;
  const secToX = useCallback((sec: number) => sec * 1000 * pxPerMs, [pxPerMs]);
  const xToSec = useCallback(
    (px: number) => (pxPerMs > 0 ? px / pxPerMs / 1000 : 0),
    [pxPerMs],
  );

  const {
    scaleOuterRef,
    playheadLineRef,
    playheadHandleRef,
    showPlayhead,
    getPlayheadSec,
    handleScalePointerDown,
    handleHandlePointerDown,
    handleHandleKeyDown,
  } = useTimelinePlayhead({ traceDuration, secToX, xToSec });

  // Stable id/node-taking callbacks shared by every row shell (see
  // TimelineRows.tsx — stable references keep the memo boundary effective).
  const handleSelectNode = useCallback(
    (nodeId: string) => {
      capture("trace_detail:node_selected", {
        source: "timeline",
        ...analyticsDimensions,
      });
      setSelectedNodeId(nodeId);
      // Reopen the detail panel on any select — including re-clicking the
      // already-selected row, where the URL param wouldn't fire an effect.
      layout?.expandDetailPanel();
      // Mobile: jump to the Info tab on the same re-click path (no-op on desktop).
      mobileLayout?.switchToInfoTab();
    },
    [setSelectedNodeId, layout, mobileLayout, capture, analyticsDimensions],
  );
  const handleHoverNode = useCallback(
    (node: TreeNode) => {
      setHoveredNodeId(node.id);
      handleHover(node);
    },
    [handleHover],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Header: name label + time scale. The scale shares the chart lane's
          coordinate space and neither scrolls, so no transform sync is needed —
          it only reserves the width the chart's scrollbar takes. Transport
          controls live in the shared navigation header (see PlaybackControls). */}
      <div className="flex shrink-0">
        <div
          className="bg-background text-muted-foreground flex shrink-0 items-center pl-2 text-xs font-bold"
          style={{ width: `${gutterWidth}px` }}
        >
          <span className="truncate" title="Name">
            Name
          </span>
        </div>
        <div className="bg-border-contrast/60 w-px shrink-0" />
        <div
          ref={scaleOuterRef}
          onPointerDown={handleScalePointerDown}
          className="flex-1 cursor-pointer overflow-hidden select-none"
          style={{ marginRight: `${chartBox.scrollbarWidth}px` }}
        >
          <div className="relative">
            <TimelineScale
              ticks={chartLayout.ticks}
              laneWidth={chartBox.width}
            />
            {showPlayhead && (
              <div
                ref={playheadHandleRef}
                role="slider"
                tabIndex={0}
                aria-label="Playhead position"
                aria-valuemin={0}
                aria-valuemax={Number(traceDuration.toFixed(2))}
                aria-valuenow={Number(getPlayheadSec().toFixed(2))}
                onPointerDown={handleHandlePointerDown}
                onKeyDown={handleHandleKeyDown}
                className={cn(
                  "absolute top-0 bottom-0 z-30 -ml-1.5 w-3 cursor-ew-resize select-none",
                  "focus-visible:ring-ring rounded focus-visible:ring-2 focus-visible:outline-none",
                )}
                style={{
                  transform: `translateX(${secToX(getPlayheadSec())}px)`,
                }}
              >
                <div className="bg-primary mx-auto h-2 w-2 rotate-45" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body: gutter pane | resizer | chart pane. */}
      <div
        className="flex min-h-0 flex-1"
        onMouseLeave={() => setHoveredNodeId(null)}
      >
        {/* Gutter pane — a one-way projection of the chart's vertical scroll
            (translateY), never its own scroll container, so it stays locked to
            the chart. Wheeling or touch-dragging over it drives the chart.
            touchAction:none stops the browser claiming the vertical pan gesture
            (there's nothing to pan here) so our pointer-drag handlers fire. */}
        <div
          onWheel={handleGutterWheel}
          onPointerDown={handleGutterPointerDown}
          onPointerMove={handleGutterPointerMove}
          onPointerUp={handleGutterPointerEnd}
          onPointerCancel={handleGutterPointerEnd}
          className="shrink-0 touch-none overflow-hidden"
          style={{ width: `${gutterWidth}px` }}
        >
          <div
            ref={gutterInnerRef}
            style={{
              // Match the chart's scrollable extent. The chart no longer scrolls
              // horizontally, so there is no horizontal scrollbar height to
              // reserve for any more.
              height: `${totalSize}px`,
              position: "relative",
              willChange: "transform",
            }}
          >
            {chartLayout.nodes.map((row) => {
              const nodeId = row.node.id;
              return (
                <TimelineGutterRowShell
                  key={nodeId}
                  row={row}
                  top={row.y}
                  height={row.height}
                  isSelected={selectedNodeId === nodeId}
                  isHovered={hoveredNodeId === nodeId}
                  hasChildren={row.hasChildren}
                  isCollapsed={row.isCollapsed}
                  maxVisualDepth={gutterMaxVisualDepth}
                  onSelect={handleSelectNode}
                  onHover={handleHoverNode}
                  onToggleCollapse={toggleCollapsed}
                />
              );
            })}
          </div>
        </div>

        {/* Resizer: structural 1px divider with a wider invisible drag grip. */}
        <div className="bg-border-contrast/60 relative w-px shrink-0">
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize name column"
            onPointerDown={startGutterResize}
            className={cn(
              "hover:bg-primary/40 active:bg-primary/40 absolute inset-y-0 left-1/2 z-20 w-2",
              "-translate-x-1/2 cursor-col-resize",
            )}
          />
        </div>

        {/* Chart pane — vertical scroll only. overflow-x is hidden rather than
            auto so a stray sub-pixel can never reintroduce a horizontal
            scrollbar; the content is exactly the measured lane wide. */}
        <div
          ref={chartRef}
          onScroll={handleChartScroll}
          className="flex-1 overflow-x-hidden overflow-y-auto"
        >
          <div
            style={{
              height: `${totalSize}px`,
              width: `${chartBox.width}px`,
              position: "relative",
            }}
          >
            {chartLayout.nodes.map((row) => {
              const nodeId = row.node.id;
              return (
                <TimelineChartRowShell
                  key={nodeId}
                  row={row}
                  top={row.y}
                  height={row.height}
                  width={chartBox.width}
                  isSelected={selectedNodeId === nodeId}
                  isHovered={hoveredNodeId === nodeId}
                  showDuration={showDuration}
                  showCostTokens={showCostTokens}
                  showScores={showScores}
                  showComments={showComments}
                  colorCodeMetrics={colorCodeMetrics}
                  parentTotalCost={parentTotalCost}
                  parentTotalDuration={parentTotalDuration}
                  commentCount={comments.get(nodeId) ?? 0}
                  nodeScores={scoresByNodeId.get(nodeId) ?? EMPTY_SCORES}
                  onSelect={handleSelectNode}
                  onHover={handleHoverNode}
                />
              );
            })}
            {showPlayhead && (
              <div
                ref={playheadLineRef}
                className="bg-primary pointer-events-none absolute top-0 z-20 w-0.5"
                style={{
                  left: 0,
                  height: `${totalSize}px`,
                  transform: `translateX(${secToX(getPlayheadSec())}px)`,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
