/**
 * TraceTimeline - Main timeline view component
 * Renders Gantt chart visualization with virtualized rows
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
import { TimelineRow } from "./TimelineRow";

// Width of the left gutter (indented span-name tree). Resizable; these bound it.
const GUTTER_WIDTH_DEFAULT = 240;
const GUTTER_WIDTH_MIN = 160;
const GUTTER_WIDTH_MAX = 560;

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

  const timeIndexRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Resizable name gutter so users can trade name space for timeline space.
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
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [gutterWidth],
  );

  // Timeline origin (the 0s mark): the earliest start time across the WHOLE
  // tree, not just the roots. A child can start before its root (the TRACE
  // wrapper's start is the trace timestamp, which may be later than the first
  // observation), so anchoring to roots alone misplaces the origin past early
  // children. See findEarliestStartTime.
  const traceStartTime = useMemo(() => {
    return findEarliestStartTime(roots) ?? new Date();
  }, [roots]);

  // TODO: Extract aggregation logic to shared utility - duplicated in tree-building.ts and TraceTree.tsx
  // Total span of the scale, in seconds, measured from the timeline origin
  // (earliest start) to the latest end across the tree, so every bar fits
  // within the scale even when the origin sits before a root's start. The
  // latency fallback (for traces without end times) is anchored to the origin,
  // so a root that starts after an earlier child still fits. See
  // calculateTraceDuration.
  const traceDuration = useMemo(() => {
    return calculateTraceDuration(roots, traceStartTime);
  }, [roots, traceStartTime]);

  // Calculate step size for time axis
  const stepSize = useMemo(() => {
    return calculateStepSize(traceDuration, SCALE_WIDTH);
  }, [traceDuration]);

  // Flatten tree with pre-computed timeline metrics
  const flattenedItems = useMemo(() => {
    return flattenTreeWithTimelineMetrics(
      roots,
      collapsedNodes,
      traceStartTime,
      traceDuration,
      SCALE_WIDTH,
    );
  }, [roots, collapsedNodes, traceStartTime, traceDuration]);

  // Width of the time track (the gantt area). Padding leaves room for the
  // trailing metric label that rides after each bar.
  const trackWidth = useMemo(() => {
    if (flattenedItems.length === 0) return SCALE_WIDTH;

    const maxEnd = Math.max(
      ...flattenedItems.map(
        (item) => item.metrics.startOffset + item.metrics.itemWidth,
      ),
    );

    return Math.max(SCALE_WIDTH, maxEnd + 300);
  }, [flattenedItems]);

  // Total scrollable width = name gutter + time track. The gutter is pinned
  // (sticky) in both the header and the rows, so the header scale and the bars
  // share the same horizontal scroll and stay aligned.
  const totalWidth = gutterWidth + trackWidth;

  // Set up virtualizer for rows
  const rowVirtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => contentRef.current,
    estimateSize: () => 42, // Row height in pixels
    overscan: 500, // Large overscan for smooth scrolling with complex items
  });

  // Auto-scroll to selected node on initial load (URL-based navigation only)
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
        // Use behavior: "auto" for instant scroll on initial load to prevent
        // visible scroll animation after page render. The synchronous scroll
        // completes within useLayoutEffect, before browser paint.
        rowVirtualizer.scrollToIndex(index, {
          align: "center",
          behavior: "auto",
        });
        hasScrolledRef.current = true;
      }
    }
  }, [selectedNodeId, flattenedItems, rowVirtualizer]);

  // Scroll sync handlers
  const handleTimeIndexScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (contentRef.current) {
      contentRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleContentScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (timeIndexRef.current) {
      timeIndexRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  // Get parent totals for heatmap coloring (aggregate across all roots)
  const parentTotalCost = useMemo(() => {
    return roots.reduce(
      (acc, r) => {
        if (!r.totalCost) return acc;
        return acc ? acc.plus(r.totalCost) : r.totalCost;
      },
      // TODO: make it nice
      undefined as (typeof roots)[0]["totalCost"],
    );
  }, [roots]);
  const parentTotalDuration = traceDuration;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* Header: name-gutter label + time scale. Horizontally synced with the
          body; the gutter spacer is sticky-left so the scale stays aligned with
          the bars under it. */}
      <div
        ref={timeIndexRef}
        className="flex shrink-0 overflow-x-auto overflow-y-hidden"
        onScroll={handleTimeIndexScroll}
      >
        <div
          className="bg-background border-border/60 text-muted-foreground sticky left-0 z-10 flex shrink-0 items-end border-r pb-2 pl-2 text-xs font-medium"
          style={{ width: `${gutterWidth}px` }}
        >
          Name
        </div>
        <div className="shrink-0" style={{ width: `${trackWidth}px` }}>
          <TimelineScale
            traceDuration={traceDuration}
            scaleWidth={SCALE_WIDTH}
            stepSize={stepSize}
          />
        </div>
      </div>

      {/* Main scrollable content with virtualized rows */}
      <div
        ref={contentRef}
        className="flex-1 overflow-auto"
        onScroll={handleContentScroll}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: `${totalWidth}px`,
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = flattenedItems[virtualRow.index];
            if (!item) return null;

            const nodeId = item.node.id;
            const isSelected = selectedNodeId === nodeId;
            const hasChildren = item.node.children.length > 0;
            const isCollapsed = collapsedNodes.has(nodeId);

            // Get scores for this node
            const nodeScores = scores.filter((score) => {
              // Match based on observation ID or trace ID
              if (item.node.type === "TRACE") {
                return score.traceId === item.node.id;
              }
              return score.observationId === item.node.id;
            });

            // Get comment count for this node
            const commentCount = comments.get(nodeId) ?? 0;

            return (
              <div
                key={nodeId}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: `${totalWidth}px`,
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <TimelineRow
                  item={item}
                  isSelected={isSelected}
                  onSelect={() => setSelectedNodeId(nodeId)}
                  onHover={() => handleHover(item.node)}
                  onToggleCollapse={() => toggleCollapsed(nodeId)}
                  hasChildren={hasChildren}
                  isCollapsed={isCollapsed}
                  gutterWidth={gutterWidth}
                  trackWidth={trackWidth}
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
          })}
        </div>
      </div>

      {/* Drag handle to resize the gutter. Anchored at the gutter's right edge,
          which is pinned at viewport x = gutterWidth (the gutter is sticky). */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize name column"
        onPointerDown={startGutterResize}
        className="hover:bg-primary/40 active:bg-primary/40 absolute top-0 bottom-0 z-20 w-1 -translate-x-1/2 cursor-col-resize"
        style={{ left: `${gutterWidth}px` }}
      />
    </div>
  );
}
