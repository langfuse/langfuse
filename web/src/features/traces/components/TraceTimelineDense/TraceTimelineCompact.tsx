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
import { usdFormatter, formatTokenCounts } from "@/src/utils/numbers";
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
  const { roots, nodeMap } = useTraceData();
  const { selectedNodeId } = useSelection();
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

  // Cost and usage the way the tree row states them, so hovering a hairline row
  // tells you what reading a tree row would. Same formatters, same order.
  const factsOf = useCallback(
    (nodeId: string) => {
      const node = nodeMap.get(nodeId);
      if (!node) return [];
      const facts: string[] = [];
      if (node.totalCost) {
        const aggregated = node.children.length > 0 || node.type === "TRACE";
        facts.push(
          `${aggregated ? "∑ " : ""}${usdFormatter(node.totalCost.toNumber())}`,
        );
      }
      const tokens = formatTokenCounts(
        node.inputUsage,
        node.outputUsage,
        node.totalUsage,
      );
      if (tokens) facts.push(tokens);
      return facts;
    },
    [nodeMap],
  );

  return (
    <div ref={measureRef} className="h-full w-full overflow-hidden">
      {box && box.width > 0 && box.height > 0 ? (
        <TimelineDense
          roots={roots}
          box={box}
          gutter="auto"
          pointer={pointerModality}
          barColor="type"
          compress={false}
          showReadout={false}
          selectedId={selectedNodeId}
          onSelect={selectNode}
          onHover={handleHoverNode}
          activeIds={activeIds}
          playhead={playhead}
          factsOf={factsOf}
        />
      ) : null}
    </div>
  );
}
