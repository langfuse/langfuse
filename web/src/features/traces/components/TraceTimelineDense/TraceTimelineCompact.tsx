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

import { useCallback, useState } from "react";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useHandlePrefetchObservation } from "@/src/features/traces/hooks/useHandlePrefetchObservation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useTraceAnalyticsDimensions } from "@/src/features/traces/hooks/useTraceAnalyticsDimensions";
import { detectPointerModality } from "../../fns/timeline/density";
import { useDesktopLayoutContextOptional } from "../TraceLayoutDesktop";
import { useMobileLayoutContextOptional } from "../TraceLayoutMobile";
import { TimelineDense } from "./TimelineDense";

export function TraceTimelineCompact() {
  const { roots } = useTraceData();
  const { selectedNodeId, setSelectedNodeId } = useSelection();
  const { handleHover } = useHandlePrefetchObservation();
  const capture = usePostHogClientCapture();
  const analyticsDimensions = useTraceAnalyticsDimensions();
  const layout = useDesktopLayoutContextOptional();
  const mobileLayout = useMobileLayoutContextOptional();

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

  const handleSelect = useCallback(
    (nodeId: string) => {
      capture("trace_detail:node_selected", {
        source: "timeline_compact",
        ...analyticsDimensions,
      });
      setSelectedNodeId(nodeId);
      // Reopen the detail panel on any select, including re-selecting the same
      // row — matching the Tree and Timeline views.
      layout?.expandDetailPanel();
      mobileLayout?.switchToInfoTab();
    },
    [capture, analyticsDimensions, setSelectedNodeId, layout, mobileLayout],
  );

  const handleHoverNode = useCallback(
    (nodeId: string) => {
      const node = findNode(roots, nodeId);
      if (node) handleHover(node);
    },
    [roots, handleHover],
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
          onSelect={handleSelect}
          onHover={handleHoverNode}
        />
      ) : null}
    </div>
  );
}

/** Iterative: a deep trace must not blow the stack to find one node. */
function findNode(
  roots: ReturnType<typeof useTraceData>["roots"],
  nodeId: string,
) {
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === nodeId) return node;
    for (const child of node.children) stack.push(child);
  }
  return null;
}
