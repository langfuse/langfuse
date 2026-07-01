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
import { Pause, Play, Square } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTraceData } from "../../contexts/TraceDataContext";
import { useSelection } from "../../contexts/SelectionContext";
import { useViewPreferences } from "../../contexts/ViewPreferencesContext";
import {
  useActiveObservationIds,
  useSetActiveObservationIds,
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

  // --- Playhead / transport (Ableton-style) ---------------------------------
  // A vertical playhead over the gantt. Click the time scale to place it, drag
  // its handle to scrub, or play/pause/stop it. The line + handle positions are
  // driven imperatively (refs + style.transform) so playback animates at 60fps
  // without re-rendering the virtualized rows every frame.
  const scaleOuterRef = useRef<HTMLDivElement>(null);
  const playheadLineRef = useRef<HTMLDivElement>(null);
  const playheadHandleRef = useRef<HTMLDivElement>(null);
  const playheadSecRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const [showPlayhead, setShowPlayhead] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const playbackRateRef = useRef(1);
  playbackRateRef.current = playbackRate;

  // The observations "playing" at the playhead's time (start ≤ t ≤ end). Lives
  // in a shared store (PlayheadContext) so the graph view lights up the same
  // set; written from positionPlayhead only when the SET changes (a boundary
  // crossing — a handful of times/sec), not every animation frame.
  const activeNodeIds = useActiveObservationIds();
  const setActiveNodeIds = useSetActiveObservationIds();
  const activeIdsRef = useRef(activeNodeIds);
  activeIdsRef.current = activeNodeIds;

  // Per-row active window in seconds from the timeline origin.
  const nodeWindows = useMemo(
    () =>
      flattenedItems.map((item) => {
        const originMs = traceStartTime.getTime();
        const startSec = (item.node.startTime.getTime() - originMs) / 1000;
        const endSec =
          ((item.node.endTime ?? item.node.startTime).getTime() - originMs) /
          1000;
        return { id: item.node.id, startSec, endSec };
      }),
    [flattenedItems, traceStartTime],
  );
  const nodeWindowsRef = useRef(nodeWindows);
  nodeWindowsRef.current = nodeWindows;

  const secToX = useCallback(
    (sec: number) =>
      traceDuration > 0 ? (sec / traceDuration) * SCALE_WIDTH : 0,
    [traceDuration],
  );

  // Write the playhead position straight to the DOM (no setState → no row
  // re-render). Refs are null until showPlayhead renders them; the JSX seeds the
  // initial transform from playheadSecRef so the first placement is correct.
  const positionPlayhead = useCallback(
    (sec: number) => {
      const clamped = Math.max(0, Math.min(traceDuration, sec));
      playheadSecRef.current = clamped;
      const x = secToX(clamped);
      const t = `translateX(${x}px)`;
      if (playheadLineRef.current) playheadLineRef.current.style.transform = t;
      if (playheadHandleRef.current)
        playheadHandleRef.current.style.transform = t;

      // Recompute the active set; only commit to state when it actually changes,
      // so playback re-renders rows on boundary crossings, not every frame.
      const next = new Set<string>();
      for (const w of nodeWindowsRef.current) {
        if (clamped >= w.startSec && clamped <= w.endSec) next.add(w.id);
      }
      const cur = activeIdsRef.current;
      let changed = cur.size !== next.size;
      if (!changed) {
        for (const id of next) {
          if (!cur.has(id)) {
            changed = true;
            break;
          }
        }
      }
      if (changed) setActiveNodeIds(next);
    },
    [traceDuration, secToX, setActiveNodeIds],
  );

  const pause = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setIsPlaying(false);
  }, []);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const outer = scaleOuterRef.current;
      if (!outer || traceDuration <= 0) return;
      const contentX =
        clientX -
        outer.getBoundingClientRect().left +
        (chartRef.current?.scrollLeft ?? 0);
      positionPlayhead((contentX / SCALE_WIDTH) * traceDuration);
    },
    [traceDuration, positionPlayhead],
  );

  const handleScalePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault(); // don't start a text selection on the scale labels
      pause();
      setShowPlayhead(true);
      seekFromClientX(e.clientX);
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
    [pause, seekFromClientX],
  );

  const play = useCallback(() => {
    if (traceDuration <= 0) return;
    setShowPlayhead(true);
    // Restart from the beginning if the playhead is at (or past) the end.
    if (playheadSecRef.current >= traceDuration - 0.05) positionPlayhead(0);
    setIsPlaying(true);
    lastTsRef.current = 0;
    const step = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const next = playheadSecRef.current + dt * playbackRateRef.current;
      if (next >= traceDuration) {
        positionPlayhead(traceDuration);
        pause();
        return;
      }
      positionPlayhead(next);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [traceDuration, positionPlayhead, pause]);

  const stop = useCallback(() => {
    pause();
    playheadSecRef.current = 0;
    setActiveNodeIds(new Set());
    setShowPlayhead(false); // stop clears the playhead (and the glow)
  }, [pause, setActiveNodeIds]);

  const cycleRate = useCallback(
    () => setPlaybackRate((r) => (r >= 4 ? 1 : r * 2)),
    [],
  );

  // Cancel any in-flight animation on unmount.
  useEffect(() => () => pause(), [pause]);

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
      {/* Header: transport + name label + time scale (transform-synced). */}
      <div className="flex shrink-0">
        <div
          className="bg-background text-muted-foreground flex shrink-0 items-center gap-0.5 pl-1 text-xs font-medium"
          style={{ width: `${gutterWidth}px` }}
        >
          <button
            type="button"
            onClick={isPlaying ? pause : play}
            title={isPlaying ? "Pause" : "Play"}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="hover:bg-muted hover:text-foreground flex h-5 w-5 items-center justify-center rounded"
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={stop}
            title="Stop"
            aria-label="Stop"
            className="hover:bg-muted hover:text-foreground flex h-5 w-5 items-center justify-center rounded"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={cycleRate}
            title="Playback speed"
            aria-label={`Playback speed ${playbackRate}x`}
            className="hover:bg-muted hover:text-foreground flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] tabular-nums"
          >
            {playbackRate}×
          </button>
          <span className="ml-1 truncate">Name</span>
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
                  transform: `translateX(${secToX(playheadSecRef.current)}px)`,
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
                  transform: `translateX(${secToX(playheadSecRef.current)}px)`,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
