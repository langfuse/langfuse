/* eslint-disable boundaries/dependencies -- TODO: component privacy */
/**
 * TraceTimeline, wired into the trace panel.
 *
 * This is the container half: it measures the box it has been given and hands
 * that to the renderer, and it connects the renderer's selection and hover to
 * the same contexts the Tree and Timeline views use, so all three select the
 * same observation and open the same detail panel.
 *
 * The renderer (Timeline) takes a measured box and nothing implicit,
 * which is what keeps it reviewable in Storybook across every size and shape.
 */

import { useCallback, useState } from "react";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesProvider";
import { type RowMetrics } from "./components/Timeline/components/TimelineRowMetrics";
import { usdFormatter } from "@/src/utils/numbers";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataProvider";
import { useSelection } from "@/src/features/traces/contexts/SelectionProvider";
import { useTraceSearchMatches } from "@/src/features/traces/hooks/useTraceSearchMatches";
import { useHandlePrefetchObservation } from "@/src/features/traces/hooks/useHandlePrefetchObservation";
import { useSelectTraceNode } from "@/src/features/traces/hooks/useSelectTraceNode";
import { detectPointerModality } from "./fns/detectPointerModality";
import { Timeline } from "./components/Timeline/Timeline";

function readPackedPreference(
  key: string,
  legacyKey: string,
  fallback: boolean,
): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored != null) return JSON.parse(stored) as boolean;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy == null) return fallback;
    const value = JSON.parse(legacy) === true;
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.removeItem(legacyKey);
    return value;
  } catch {
    return fallback;
  }
}

export function TraceTimeline() {
  const { roots, nodeMap, scope } = useTraceData();
  const { selectedNodeId, collapsedNodes, selectionLocked } = useSelection();
  // The same five switches the tree honours. They live in one place because a
  // toggle that works in one view and silently does nothing in the other is
  // worse than no toggle.
  const { showDuration, showCostTokens } = useViewPreferences();
  const isSession = scope.type === "session";
  // A session and a single trace remember the switch separately. A session
  // opens packed until the user says otherwise; a trace opens one row per span.
  const [tracePacked, setTracePacked] = useLocalStorage(
    "timelinePackedLayout",
    readPackedPreference(
      "timelinePackedLayout",
      "timelineCompactLayout",
      false,
    ),
  );
  const [sessionPacked, setSessionPacked] = useLocalStorage(
    "timelinePackedLayoutSession",
    readPackedPreference(
      "timelinePackedLayoutSession",
      "timelineCompactLayoutSession",
      true,
    ),
  );
  const timelinePacked = isSession ? sessionPacked : tracePacked;
  const setTimelinePacked = isSession ? setSessionPacked : setTracePacked;
  const { handleHover } = useHandlePrefetchObservation();
  const selectNode = useSelectTraceNode("timeline_compact");

  /**
   * The search box, answered in place. The renderer takes the SET of ids that
   * keep their colour and nothing about searching — it dims the rest, reveals
   * the first hit and states the count, which is all a chart can do with a
   * query. The Graph reads the same hook, so the two cannot state different
   * counts for one query.
   */
  const search = useTraceSearchMatches();

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

  /**
   * What a row says about itself: its cost, formatted the way a tree row states
   * it. Scores, comment counts and heat-map colouring were tried here and taken
   * back out — a row beside a bar cannot carry them consistently, and colour
   * already means observation type. `showScores` and `showComments` mean what
   * their storage keys have always said: the observation tree.
   */
  const metricsOf = useCallback(
    (nodeId: string): RowMetrics => {
      const node = nodeMap.get(nodeId);
      if (!node?.totalCost || !showCostTokens) return {};
      return { costText: usdFormatter(node.totalCost.toNumber()) };
    },
    [nodeMap, showCostTokens],
  );

  return (
    <div ref={measureRef} className="h-full w-full overflow-hidden">
      {box && box.width > 0 && box.height > 0 ? (
        <Timeline
          roots={roots}
          box={box}
          gutter="auto"
          collapsed={collapsedNodes}
          pointer={pointerModality}
          barColor="type"
          compress={false}
          showReadout={false}
          selectedId={selectedNodeId}
          onSelect={selectionLocked ? undefined : selectNode}
          onHover={handleHoverNode}
          metricsOf={metricsOf}
          showDuration={showDuration}
          search={search}
          rowLayout={timelinePacked ? "packed" : "tree"}
          onRowLayoutChange={(layout) => setTimelinePacked(layout === "packed")}
        />
      ) : null}
    </div>
  );
}
