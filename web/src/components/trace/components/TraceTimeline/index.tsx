/**
 * TraceTimeline - Gantt waterfall: a fixed name-gutter + a scrollable chart.
 *
 * Two panes, side by side, sharing the virtualized rows:
 *  - Gutter pane (fixed, resizable): the indented name tree. It never scrolls
 *    itself — its content is a one-way translateY projection of the chart's
 *    vertical scroll, so the two panes can't drift; wheeling or touch-dragging
 *    over it drives the chart.
 *  - Chart pane (flex-1): the gantt bars. Owns the only scrollbars (horizontal
 *    and vertical) and is the virtualizer's scroll element.
 *
 * The time scale sits in an overflow-hidden header strip whose inner is
 * transform-synced to the chart's horizontal scroll, so the scale stays aligned
 * with the bars without a scrollbar of its own.
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
import { useTraceData } from "../../contexts/TraceDataContext";
import { useSelection } from "../../contexts/SelectionContext";
import { useViewPreferences } from "../../contexts/ViewPreferencesContext";
import {
  useActiveObservationIds,
  usePlayhead,
  useShowPlayhead,
} from "../../contexts/PlayheadContext";
import { useHandlePrefetchObservation } from "../../hooks/useHandlePrefetchObservation";
import { flattenTreeWithTimelineMetrics } from "./timeline-flattening";
import {
  calculateStepSize,
  calculateTraceDuration,
  findEarliestStartTime,
  SCALE_WIDTH,
} from "./timeline-calculations";
import { TimelineScale } from "./TimelineScale";
import { TimelineGutterRow } from "./TimelineGutterRow";
import { TimelineBar } from "./TimelineBar";
import { useDesktopLayoutContextOptional } from "../_layout/TraceLayoutDesktop";
import { cn } from "@/src/utils/tailwind";

// Width of the left name gutter. Resizable; these bound it. Kept slim so the
// waterfall (the point of the timeline) gets the central space.
const GUTTER_WIDTH_DEFAULT = 200;
const GUTTER_WIDTH_MIN = 160;
const GUTTER_WIDTH_MAX = 560;
// Dense waterfall rows (LFE-10539): the 16px bar / 16px name chip sit centered
// with ~5px of breathing room. Drives both the virtualizer estimate and the
// rendered row height, so the two never drift.
const ROW_HEIGHT = 26;

export function TraceTimeline() {
  const { roots, serverScores: scores, comments } = useTraceData();
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
  // Optional (null in the mobile layout): reopen the detail panel on select.
  const layout = useDesktopLayoutContextOptional();

  // The chart is the single vertical scroller; the gutter content is a one-way
  // transform projection of it (gutterInnerRef), so the two panes can't drift.
  const gutterInnerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const scaleInnerRef = useRef<HTMLDivElement>(null);

  // Hovered row, lifted to shared state so hovering either pane highlights the
  // whole row (caption + chart), which CSS :hover can't do across two panes.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Resizable name gutter so users can trade name space for chart space.
  const [gutterWidth, setGutterWidth] = useState(GUTTER_WIDTH_DEFAULT);
  const startGutterResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = gutterWidth;
      const onMove = (ev: PointerEvent) => {
        const next = startWidth + (ev.clientX - startX);
        setGutterWidth(
          Math.min(GUTTER_WIDTH_MAX, Math.max(GUTTER_WIDTH_MIN, next)),
        );
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      // pointercancel (OS gesture, contextmenu, touch interruption) must also
      // tear down the move listener, else the gutter ghost-resizes afterwards.
      window.addEventListener("pointercancel", onUp);
    },
    [gutterWidth],
  );

  // Timeline origin (the 0s mark): the earliest start time across the WHOLE
  // tree, not just the roots. See findEarliestStartTime.
  const traceStartTime = useMemo(() => {
    return findEarliestStartTime(roots) ?? new Date();
  }, [roots]);

  // TODO: Extract aggregation logic to shared utility - duplicated in tree-building.ts and TraceTree.tsx
  // Total span of the scale, in seconds, from origin to latest end. See
  // calculateTraceDuration.
  const traceDuration = useMemo(() => {
    return calculateTraceDuration(roots, traceStartTime);
  }, [roots, traceStartTime]);

  const stepSize = useMemo(() => {
    return calculateStepSize(traceDuration, SCALE_WIDTH);
  }, [traceDuration]);

  const flattenedItems = useMemo(() => {
    return flattenTreeWithTimelineMetrics(
      roots,
      collapsedNodes,
      traceStartTime,
      traceDuration,
      SCALE_WIDTH,
    );
  }, [roots, collapsedNodes, traceStartTime, traceDuration]);

  // Width of the chart content (gantt area). Padding leaves room for the
  // trailing metric label that rides after each bar.
  const chartContentWidth = useMemo(() => {
    if (flattenedItems.length === 0) return SCALE_WIDTH;

    const maxEnd = Math.max(
      ...flattenedItems.map(
        (item) => item.metrics.startOffset + item.metrics.itemWidth,
      ),
    );

    return Math.max(SCALE_WIDTH, maxEnd + 300);
  }, [flattenedItems]);

  // Virtualizer drives off the chart pane; the gutter mirrors its vertical scroll.
  // overscan is a ROW COUNT (not px): keep it small so a long trace re-renders
  // only a few dozen rows per scroll step instead of ~1000 (the old "500" — a
  // px-vs-items mix-up — made big traces stutter). ~16 rows ≈ half a viewport of
  // headroom, enough to avoid blank rows on a normal scroll.
  const rowVirtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => chartRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  });

  // Scroll the selected row into view whenever the selection changes — so
  // selecting a node elsewhere (e.g. clicking it in the graph view) brings the
  // matching timeline row into view. `align: "auto"` scrolls the minimum needed
  // and is a no-op when the row is already visible, so clicking a visible row
  // never jumps the timeline.
  const prevSelectedIdRef = useRef<string | null | undefined>(undefined);

  useLayoutEffect(() => {
    if (!selectedNodeId || selectedNodeId === prevSelectedIdRef.current) {
      prevSelectedIdRef.current = selectedNodeId;
      return;
    }
    const isInitial = prevSelectedIdRef.current === undefined;
    prevSelectedIdRef.current = selectedNodeId;

    const index = flattenedItems.findIndex(
      (item) => item.node.id === selectedNodeId,
    );
    if (index === -1) return;
    const chart = chartRef.current;
    if (!chart) return;

    // Scroll BOTH axes in a single scrollTo so the node comes fully into view —
    // vertical alone leaves a node deep in the timeline off-screen to the right.
    // One call, not two: a separate vertical scrollToIndex + horizontal scrollTo
    // are two competing smooth animations on the same element, and the vertical
    // one (which re-fires as it settles) clobbers the horizontal back to 0.
    // Rows are fixed-height (ROW_HEIGHT, no dynamic measurement), so the row's
    // vertical offset is exactly index * ROW_HEIGHT — compute it directly.
    const rowTop = index * ROW_HEIGHT;
    const viewTop = chart.scrollTop;
    let top = viewTop;
    if (isInitial) {
      top = rowTop - (chart.clientHeight - ROW_HEIGHT) / 2; // center on load
    } else if (rowTop < viewTop) {
      top = rowTop; // above the fold → align to top
    } else if (rowTop + ROW_HEIGHT > viewTop + chart.clientHeight) {
      top = rowTop - chart.clientHeight + ROW_HEIGHT; // below → align to bottom
    }

    // Horizontal: bring the bar into view, but only when it isn't already
    // comfortably visible (a no-op then, so selecting a visible bar never yanks
    // the chart sideways).
    let left = chart.scrollLeft;
    const metrics = flattenedItems[index]?.metrics;
    if (metrics) {
      const barStart = metrics.startOffset;
      const viewLeft = chart.scrollLeft;
      const viewRight = viewLeft + chart.clientWidth;
      if (barStart < viewLeft + 16 || barStart > viewRight - 16) {
        left = Math.max(0, barStart - chart.clientWidth * 0.2);
      }
    }

    chart.scrollTo({
      top: Math.max(0, top),
      left,
      behavior: isInitial ? "auto" : "smooth",
    });
  }, [selectedNodeId, flattenedItems]);

  // The chart owns the only vertical scroll. The gutter and the time scale are
  // one-way projections of it (translateY / translateX) updated in the same
  // scroll frame — no second scroll container to fight the chart's momentum,
  // which is what made the two panes drift apart.
  const handleChartScroll = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (gutterInnerRef.current) {
      gutterInnerRef.current.style.transform = `translateY(${-chart.scrollTop}px)`;
    }
    if (scaleInnerRef.current) {
      scaleInnerRef.current.style.transform = `translateX(${-chart.scrollLeft}px)`;
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
  const parentTotalDuration = traceDuration;

  const totalSize = rowVirtualizer.getTotalSize();
  const virtualItems = rowVirtualizer.getVirtualItems();

  // --- Playhead (driven by the shared playback engine) -----------------------
  // The transport (play/pause/stop) + circular progress live in the navigation
  // header so they show in every view; the engine (PlayheadContext) owns the
  // RAF loop and position. Here we only draw the Timeline's vertical playhead
  // line + handle and let the scale place/scrub it.
  const scaleOuterRef = useRef<HTMLDivElement>(null);
  const playheadLineRef = useRef<HTMLDivElement>(null);
  const playheadHandleRef = useRef<HTMLDivElement>(null);

  const { seekToSec, pause, getPlayheadSec, subscribePosition } = usePlayhead();
  const showPlayhead = useShowPlayhead();
  // The observations "playing" at the playhead — drives the row glow. Set by the
  // engine; re-renders the rows only on boundary crossings.
  const activeNodeIds = useActiveObservationIds();

  // Map a playhead time (seconds from origin) to an x within the gantt content.
  const secToX = useCallback(
    (sec: number) =>
      traceDuration > 0 ? (sec / traceDuration) * SCALE_WIDTH : 0,
    [traceDuration],
  );

  // Position the line + handle imperatively off the engine's position pub/sub
  // (no re-render). They only exist while showPlayhead; re-subscribe when the
  // scale (secToX) changes so the mapping stays correct.
  useEffect(() => {
    if (!showPlayhead) return;
    const apply = (sec: number) => {
      const t = `translateX(${secToX(sec)}px)`;
      if (playheadLineRef.current) playheadLineRef.current.style.transform = t;
      if (playheadHandleRef.current)
        playheadHandleRef.current.style.transform = t;
    };
    apply(getPlayheadSec());
    return subscribePosition(apply);
  }, [showPlayhead, secToX, getPlayheadSec, subscribePosition]);

  // Translate a pointer x on the scale into a seek (places/moves the playhead).
  const seekFromClientX = useCallback(
    (clientX: number) => {
      const outer = scaleOuterRef.current;
      if (!outer || traceDuration <= 0) return;
      const contentX =
        clientX -
        outer.getBoundingClientRect().left +
        (chartRef.current?.scrollLeft ?? 0);
      seekToSec((contentX / SCALE_WIDTH) * traceDuration);
    },
    [traceDuration, seekToSec],
  );

  const handleScalePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault(); // don't start a text selection on the scale labels
      seekFromClientX(e.clientX); // seekToSec pauses + shows the playhead
      // Allow click-and-drag on the scale to scrub in one gesture.
      const onMove = (ev: PointerEvent) => seekFromClientX(ev.clientX);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [seekFromClientX],
  );

  // Classic scrollbars (Windows/Linux) on the chart pane consume client area
  // the gutter/scale don't: its horizontal scrollbar eats ~15px of height, its
  // vertical scrollbar ~15px of width. We reserve the matching amount on the
  // gutter (bottom) and the scale strip (right) so the three panes share the
  // same scrollable extent — otherwise mirrored scroll clamps at the bottom and
  // a right-edge tick floats over the chart's scrollbar. Both are 0 with macOS
  // overlay bars.
  const [chartScrollbar, setChartScrollbar] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const measure = () => {
      const x = el.offsetWidth - el.clientWidth;
      const y = el.offsetHeight - el.clientHeight;
      // Only re-render when the measurement actually changes — the observer
      // fires on every content resize, but the scrollbar size rarely moves.
      setChartScrollbar((prev) =>
        prev.x === x && prev.y === y ? prev : { x, y },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chartContentWidth, totalSize, gutterWidth]);

  const renderRow = (
    virtualRow: (typeof virtualItems)[number],
    pane: "gutter" | "chart",
  ) => {
    const item = flattenedItems[virtualRow.index];
    if (!item) return null;

    const nodeId = item.node.id;
    const isSelected = selectedNodeId === nodeId;
    const isHovered = hoveredNodeId === nodeId;
    const hasChildren = item.node.children.length > 0;
    const isCollapsed = collapsedNodes.has(nodeId);

    // Playhead: rows "playing" at the current time glow (light UP) so the active
    // run stands out as the playhead sweeps — rather than dimming everything
    // else, which left a hard-to-clear "toned down" state.
    const isActive = activeNodeIds.has(nodeId);

    const onEnter = () => {
      setHoveredNodeId(nodeId);
      handleHover(item.node);
    };
    // Reopen the detail panel on any select — including re-clicking the
    // already-selected row, where the URL param (and the effect) wouldn't fire.
    const onSelectNode = () => {
      setSelectedNodeId(nodeId);
      layout?.expandDetailPanel();
    };

    const baseStyle = {
      position: "absolute" as const,
      top: 0,
      left: 0,
      height: `${virtualRow.size}px`,
      transform: `translateY(${virtualRow.start}px)`,
    };

    if (pane === "gutter") {
      return (
        <div
          key={nodeId}
          style={{ ...baseStyle, width: "100%" }}
          className={cn(
            "transition-colors duration-150",
            isActive && "bg-primary-accent/15",
          )}
        >
          <TimelineGutterRow
            item={item}
            isSelected={isSelected}
            isHovered={isHovered}
            onSelect={onSelectNode}
            onHover={onEnter}
            onToggleCollapse={() => toggleCollapsed(nodeId)}
            hasChildren={hasChildren}
            isCollapsed={isCollapsed}
          />
        </div>
      );
    }

    const nodeScores = scores.filter((score) =>
      item.node.type === "TRACE"
        ? score.traceId === item.node.id
        : score.observationId === item.node.id,
    );
    const commentCount = comments.get(nodeId) ?? 0;

    return (
      <div
        key={nodeId}
        style={{ ...baseStyle, width: `${chartContentWidth}px` }}
        className={cn(
          "cursor-pointer transition-colors duration-150",
          // Selected = accent tint so the neutral bar (bg-muted) stays visible
          // against the row; a playhead-active row glows with the same accent;
          // hover stays neutral.
          isSelected
            ? "bg-primary-accent/10"
            : isActive
              ? "bg-primary-accent/15"
              : isHovered
                ? "bg-muted"
                : "",
        )}
        onClick={onSelectNode}
        onMouseEnter={onEnter}
      >
        <TimelineBar
          node={item.node}
          metrics={item.metrics}
          isSelected={isSelected}
          isHovered={isHovered}
          showDuration={showDuration}
          showCostTokens={showCostTokens}
          showScores={showScores}
          showComments={showComments}
          colorCodeMetrics={colorCodeMetrics}
          parentTotalCost={parentTotalCost}
          parentTotalDuration={parentTotalDuration}
          commentCount={commentCount}
          scores={nodeScores}
        />
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Header: name label + time scale (transform-synced). Transport controls
          live in the shared navigation header (see PlaybackControls). */}
      <div className="flex shrink-0">
        <div
          className="bg-background text-muted-foreground flex shrink-0 items-center pl-2 text-xs font-medium"
          style={{ width: `${gutterWidth}px` }}
        >
          <span className="truncate">Name</span>
        </div>
        <div className="bg-border/60 w-px shrink-0" />
        <div
          ref={scaleOuterRef}
          onPointerDown={handleScalePointerDown}
          className="flex-1 cursor-pointer overflow-hidden select-none"
          style={{ marginRight: `${chartScrollbar.x}px` }}
        >
          <div
            ref={scaleInnerRef}
            className="relative"
            style={{ width: `${chartContentWidth}px` }}
          >
            <TimelineScale
              traceDuration={traceDuration}
              scaleWidth={SCALE_WIDTH}
              stepSize={stepSize}
            />
            {showPlayhead && (
              <div
                ref={playheadHandleRef}
                onPointerDown={(e) => {
                  // Grab the handle to scrub without re-seeking to the click x.
                  e.preventDefault();
                  e.stopPropagation();
                  pause();
                  const onMove = (ev: PointerEvent) =>
                    seekFromClientX(ev.clientX);
                  const onUp = () => {
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                    window.removeEventListener("pointercancel", onUp);
                  };
                  window.addEventListener("pointermove", onMove);
                  window.addEventListener("pointerup", onUp);
                  window.addEventListener("pointercancel", onUp);
                }}
                className="absolute top-0 bottom-0 z-30 -ml-1.5 w-3 cursor-ew-resize select-none"
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
              // Match the chart's scrollable extent, including the height its
              // horizontal scrollbar steals on classic (Windows/Linux) bars, so
              // the projected rows line up to the very bottom (0 on macOS overlay
              // bars).
              height: `${totalSize + chartScrollbar.y}px`,
              position: "relative",
              willChange: "transform",
            }}
          >
            {virtualItems.map((vr) => renderRow(vr, "gutter"))}
          </div>
        </div>

        {/* Resizer: structural 1px divider with a wider invisible drag grip. */}
        <div className="bg-border/60 relative w-px shrink-0">
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

        {/* Chart pane — the only horizontal scrollbar lives here. */}
        <div
          ref={chartRef}
          onScroll={handleChartScroll}
          className="flex-1 overflow-auto"
        >
          <div
            style={{
              height: `${totalSize}px`,
              width: `${chartContentWidth}px`,
              position: "relative",
            }}
          >
            {virtualItems.map((vr) => renderRow(vr, "chart"))}
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
