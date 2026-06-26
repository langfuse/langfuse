/**
 * TraceTimeline - Gantt waterfall: a fixed name-gutter + a scrollable chart.
 *
 * Two panes, side by side, sharing the virtualized rows:
 *  - Gutter pane (fixed, resizable): the indented name tree. Never scrolls
 *    horizontally; its vertical scroll is mirrored from the chart.
 *  - Chart pane (flex-1): the gantt bars. Owns the only horizontal scrollbar
 *    (and the vertical one). It is the virtualizer's scroll element.
 *
 * The time scale sits in an overflow-hidden header strip whose inner is
 * transform-synced to the chart's horizontal scroll, so the scale stays aligned
 * with the bars without a scrollbar of its own.
 */

import { useCallback, useMemo, useRef, useState, useLayoutEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTraceData } from "../../contexts/TraceDataContext";
import { useSelection } from "../../contexts/SelectionContext";
import { useViewPreferences } from "../../contexts/ViewPreferencesContext";
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

// Width of the left name gutter. Resizable; these bound it.
const GUTTER_WIDTH_DEFAULT = 240;
const GUTTER_WIDTH_MIN = 160;
const GUTTER_WIDTH_MAX = 560;
const ROW_HEIGHT = 42;

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

  const gutterRef = useRef<HTMLDivElement>(null);
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
  const rowVirtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => chartRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 500,
  });

  // Auto-scroll to selected node on initial load (URL-based navigation only).
  const initialNodeIdRef = useRef(selectedNodeId);
  const hasScrolledRef = useRef(false);

  useLayoutEffect(() => {
    if (
      selectedNodeId &&
      !hasScrolledRef.current &&
      selectedNodeId === initialNodeIdRef.current
    ) {
      const index = flattenedItems.findIndex(
        (item) => item.node.id === selectedNodeId,
      );

      if (index !== -1) {
        rowVirtualizer.scrollToIndex(index, {
          align: "center",
          behavior: "auto",
        });
        hasScrolledRef.current = true;
      }
    }
  }, [selectedNodeId, flattenedItems, rowVirtualizer]);

  // Vertical scroll sync (chart ⇄ gutter) + horizontal sync (chart → scale).
  // Guard with !== so mirroring doesn't loop (setting an equal value is a no-op).
  const handleChartScroll = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (gutterRef.current && gutterRef.current.scrollTop !== chart.scrollTop) {
      gutterRef.current.scrollTop = chart.scrollTop;
    }
    if (scaleInnerRef.current) {
      scaleInnerRef.current.style.transform = `translateX(${-chart.scrollLeft}px)`;
    }
  }, []);

  const handleGutterScroll = useCallback(() => {
    const gutter = gutterRef.current;
    if (!gutter) return;
    if (chartRef.current && chartRef.current.scrollTop !== gutter.scrollTop) {
      chartRef.current.scrollTop = gutter.scrollTop;
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
    const measure = () =>
      setChartScrollbar({
        x: el.offsetWidth - el.clientWidth,
        y: el.offsetHeight - el.clientHeight,
      });
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
        <div key={nodeId} style={{ ...baseStyle, width: "100%" }}>
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
          "cursor-pointer",
          (isSelected || isHovered) && "bg-muted",
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
      {/* Header: name label + time scale (scale transform-synced, no scrollbar). */}
      <div className="flex shrink-0">
        <div
          className="bg-background text-muted-foreground flex shrink-0 items-start pt-0.5 pl-2 text-xs font-medium"
          style={{ width: `${gutterWidth}px` }}
        >
          Name
        </div>
        <div className="bg-border/60 w-px shrink-0" />
        <div
          className="flex-1 overflow-hidden"
          style={{ marginRight: `${chartScrollbar.x}px` }}
        >
          <div ref={scaleInnerRef} style={{ width: `${chartContentWidth}px` }}>
            <TimelineScale
              traceDuration={traceDuration}
              scaleWidth={SCALE_WIDTH}
              stepSize={stepSize}
            />
          </div>
        </div>
      </div>

      {/* Body: gutter pane | resizer | chart pane. */}
      <div
        className="flex min-h-0 flex-1"
        onMouseLeave={() => setHoveredNodeId(null)}
      >
        {/* Gutter pane — vertical scroll mirrored from the chart; scrollbar hidden. */}
        <div
          ref={gutterRef}
          onScroll={handleGutterScroll}
          className="shrink-0 overflow-x-hidden overflow-y-auto [&::-webkit-scrollbar]:hidden"
          style={{ width: `${gutterWidth}px`, scrollbarWidth: "none" }}
        >
          <div
            style={{
              height: `${totalSize + chartScrollbar.y}px`,
              position: "relative",
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
          </div>
        </div>
      </div>
    </div>
  );
}
