/**
 * TraceTimeline - Main timeline view component
 * Renders Gantt chart visualization with virtualized rows
 */

import { useMemo, useRef, useLayoutEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTraceData } from "../../contexts/TraceDataContext";
import { useSelection } from "../../contexts/SelectionContext";
import { useViewPreferences } from "../../contexts/ViewPreferencesContext";
import { useHandlePrefetchObservation } from "../../hooks/useHandlePrefetchObservation";
import { flattenTreeWithTimelineMetrics } from "./timeline-flattening";
import { calculateStepSize, SCALE_WIDTH } from "./timeline-calculations";
import { TimelineScale } from "./TimelineScale";
import { TimelineRow } from "./TimelineRow";

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

  // TODO: Extract aggregation logic to shared utility - duplicated in tree-building.ts and TraceTree.tsx
  // Calculate trace duration from roots (max latency across all roots)
  const traceDuration = useMemo(() => {
    if (roots.length === 0) return 0;
    return Math.max(...roots.map((r) => r.latency ?? 0));
  }, [roots]);

  const traceStartTime = useMemo(() => {
    if (roots.length === 0) return new Date();
    // Use earliest start time among roots
    return new Date(Math.min(...roots.map((r) => r.startTime.getTime())));
  }, [roots]);

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

  // Calculate content width (max offset + max width)
  const contentWidth = useMemo(() => {
    if (flattenedItems.length === 0) return SCALE_WIDTH;

    const maxEnd = Math.max(
      ...flattenedItems.map(
        (item) => item.metrics.startOffset + item.metrics.itemWidth,
      ),
    );

    return Math.max(SCALE_WIDTH, maxEnd + 50); // Add padding
  }, [flattenedItems]);

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
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Sticky time scale header */}
      <div
        ref={timeIndexRef}
        className="overflow-x-auto overflow-y-hidden"
        onScroll={handleTimeIndexScroll}
      >
        <div style={{ width: `${contentWidth}px` }}>
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
            width: `${contentWidth}px`,
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
              } else {
                return score.observationId === item.node.id;
              }
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
                  width: "100%",
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
    </div>
  );
}
