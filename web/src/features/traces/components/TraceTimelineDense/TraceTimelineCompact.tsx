/**
 * TraceTimelineCompact - the compact timeline, wired into the trace panel.
 *
 * This is the container half: it measures the box it has been given and hands
 * that to the renderer, and it connects the renderer's selection and hover to
 * the same contexts the Tree and Timeline views use, so all three select the
 * same observation and open the same detail panel.
 *
 * The renderer itself (TimelineDense) takes a measured box and nothing implicit,
 * which is what keeps it reviewable in Storybook across every size and shape.
 */

import { useCallback, useMemo, useState } from "react";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { groupScoresByNode } from "@/src/features/traces/fns/nodeScores";
import { heatMapTextColor } from "@/src/features/traces/fns/heatMapTextColor";
import { type RowMetrics } from "./TimelineRowMetrics";
import { usdFormatter } from "@/src/utils/numbers";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import {
  useActiveObservationIds,
  usePlayhead,
  useShowPlayhead,
} from "@/src/features/traces/contexts/PlayheadContext";
import { useHandlePrefetchObservation } from "@/src/features/traces/hooks/useHandlePrefetchObservation";
import { useSelectTraceNode } from "@/src/features/traces/hooks/useSelectTraceNode";
import { detectPointerModality } from "../../fns/timeline/density";
import { TimelineDense } from "./TimelineDense";

export function TraceTimelineCompact() {
  const {
    roots,
    nodeMap,
    serverScores,
    traceLevelScoreOwnerIds,
    comments,
    traceDuration,
  } = useTraceData();
  const { selectedNodeId, collapsedNodes } = useSelection();
  // The same five switches the tree honours. They live in one place because a
  // toggle that works in one view and silently does nothing in the other is
  // worse than no toggle.
  const {
    showDuration,
    showCostTokens,
    showScores,
    showComments,
    colorCodeMetrics,
  } = useViewPreferences();
  const { handleHover } = useHandlePrefetchObservation();
  const selectNode = useSelectTraceNode("timeline_compact");

  // Playback: the transport lives in the navigation header and drives the shared
  // engine, so this view owes the two things you WATCH — a line that sweeps and
  // the rows lighting up as it passes them. Both are handed to the renderer,
  // which stays context-free so Storybook can still mount it anywhere.
  const { seekToSec, getPlayheadSec, subscribePosition } = usePlayhead();
  const showPlayhead = useShowPlayhead();
  const activeIds = useActiveObservationIds();
  const playhead = useMemo(
    () => ({
      visible: showPlayhead,
      getSec: getPlayheadSec,
      subscribe: subscribePosition,
      onSeek: seekToSec,
    }),
    [showPlayhead, getPlayheadSec, subscribePosition, seekToSec],
  );

  const [pointerModality] = useState(detectPointerModality);
  const [box, setBox] = useState<{ width: number; height: number } | null>(
    null,
  );

  // Measure the box that actually holds the rows. Same rule as the timeline: the
  // element being measured is the one whose client box the renderer will fill,
  // because a border or a scrollbar the math never saw is how a lane ends up
  // wider than the space available.
  const measureRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const measure = () =>
      setBox((current) =>
        current?.width === element.clientWidth &&
        current?.height === element.clientHeight
          ? current
          : { width: element.clientWidth, height: element.clientHeight },
      );
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  const handleHoverNode = useCallback(
    (nodeId: string) => {
      // The map the tree already builds, rather than a walk per hovered row —
      // and hover changes once per row at 1px rows.
      const node = nodeMap.get(nodeId);
      if (node) handleHover(node);
    },
    [nodeMap, handleHover],
  );

  // Heat-map denominators: a duration is only alarming next to the trace's own
  // total, and a cost next to the whole trace's. MILLISECONDS — `traceDuration`
  // is seconds, and passing it raw inflates every ratio ×1000, which paints
  // every label dark red.
  const parentTotalDuration = traceDuration * 1000;
  const parentTotalCost = useMemo(
    () =>
      roots.reduce(
        (total, root) =>
          root.totalCost
            ? total
              ? total.plus(root.totalCost)
              : root.totalCost
            : total,
        undefined as (typeof roots)[0]["totalCost"],
      ),
    [roots],
  );

  const scoresByNodeId = useMemo(
    () => groupScoresByNode(serverScores, traceLevelScoreOwnerIds),
    [serverScores, traceLevelScoreOwnerIds],
  );

  /**
   * What a row says about itself. Formatted here — the renderer decides only
   * what fits — with the same formatters and the same `∑` for a subtotal that a
   * tree row uses, so the two never disagree about the same number.
   */
  const metricsOf = useCallback(
    (nodeId: string): RowMetrics => {
      const node = nodeMap.get(nodeId);
      if (!node) return {};
      const aggregated = node.children.length > 0 || node.type === "TRACE";
      const cost =
        showCostTokens && node.totalCost
          ? `${aggregated ? "∑ " : ""}${usdFormatter(node.totalCost.toNumber())}`
          : null;
      return {
        costText: cost,
        durationClass:
          colorCodeMetrics && parentTotalDuration && node.latency
            ? heatMapTextColor({
                max: parentTotalDuration,
                value: node.latency * 1000,
              })
            : undefined,
        costClass:
          colorCodeMetrics && parentTotalCost && node.totalCost
            ? heatMapTextColor({
                max: parentTotalCost,
                value: node.totalCost,
              })
            : undefined,
        scores: showScores ? scoresByNodeId.get(nodeId) : undefined,
        commentCount: showComments ? comments.get(nodeId) : undefined,
      };
    },
    [
      nodeMap,
      showCostTokens,
      showScores,
      showComments,
      colorCodeMetrics,
      parentTotalCost,
      parentTotalDuration,
      scoresByNodeId,
      comments,
    ],
  );

  return (
    <div ref={measureRef} className="h-full w-full overflow-hidden">
      {box && box.width > 0 && box.height > 0 ? (
        <TimelineDense
          roots={roots}
          box={box}
          gutter="auto"
          collapsed={collapsedNodes}
          pointer={pointerModality}
          barColor="type"
          compress={false}
          showReadout={false}
          selectedId={selectedNodeId}
          onSelect={selectNode}
          onHover={handleHoverNode}
          activeIds={activeIds}
          playhead={playhead}
          metricsOf={metricsOf}
          showDuration={showDuration}
        />
      ) : null}
    </div>
  );
}
