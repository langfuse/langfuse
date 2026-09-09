/* eslint-disable @repo/no-null-render */
/**
 * TraceGraphView wrapper
 *
 * This component wraps the TraceGraphView from features/trace-graph-view/
 * and uses data from GraphDataContext.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TraceGraphView as TraceGraphViewComponent,
  type TraceGraphHoverInfo,
} from "@/src/features/trace-graph-view/components/TraceGraphView";
import { type GraphViewMode } from "@/src/features/trace-graph-view/types";
import { Layer } from "@/src/components/ui/layer";
import { useTraceGraphData } from "@/src/features/traces/contexts/TraceGraphDataContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import {
  NODE_HOVER_CARD_SURFACE_CLASS,
  NodeHoverCardContent,
} from "@/src/features/traces/components/NodeHoverCard";
import {
  tooltipPlacement,
  tooltipStyle,
} from "@/src/features/traces/fns/timeline/tooltipPlacement";
import { cn } from "@/src/utils/tailwind";
import {
  useActiveObservationIds,
  usePlayhead,
} from "@/src/features/traces/contexts/PlayheadContext";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useTraceAnalyticsDimensions } from "@/src/features/traces/hooks/useTraceAnalyticsDimensions";
import { useMobileLayoutContextOptional } from "../TraceLayoutMobile";
import { PlaybackControls } from "../PlaybackControls";

export function TraceGraphView() {
  const { agentGraphData, isLoading } = useTraceGraphData();
  const { nodeMap } = useTraceData();
  // Hover card, same pattern as the timeline and lanes: anchored to the
  // pointer, rendered in the tooltip layer so the canvas never clips it. The
  // graph resolves the hovered node to an observation id; the TreeNode lookup
  // happens here because the graph feature has no observation data.
  const [hovered, setHovered] = useState<TraceGraphHoverInfo | null>(null);
  const hoveredNode = hovered ? nodeMap.get(hovered.observationId) : undefined;
  const activeObservationIds = useActiveObservationIds();
  const { stop: stopPlayback } = usePlayhead();
  const { graphViewMode, setGraphViewMode } = useViewPreferences();
  const capture = usePostHogClientCapture();
  const analyticsDimensions = useTraceAnalyticsDimensions();
  // Optional (null on desktop): jump to the Info tab when a canvas click selects
  // an observation. The graph writes `?observation=` directly, so the tab effect
  // already covers a genuine change; this also handles cycling a repeated node
  // back to the same id, where the URL param wouldn't change.
  const mobileLayout = useMobileLayoutContextOptional();
  // Analytics live here (not in the feature component) so the feature module
  // stays free of trace-view context dependencies.
  const handleObservationSelect = useCallback(() => {
    capture("trace_detail:node_selected", {
      source: "graph",
      graphViewMode,
      ...analyticsDimensions,
    });
    mobileLayout?.switchToInfoTab();
  }, [capture, graphViewMode, analyticsDimensions, mobileLayout]);
  const handleViewModeChange = useCallback(
    (mode: GraphViewMode) => {
      // Clicking the already-active segment is a no-op — don't count it.
      if (mode !== graphViewMode) {
        capture("trace_detail:graph_mode_switch", {
          graphViewMode: mode,
          ...analyticsDimensions,
        });
      }
      setGraphViewMode(mode);
    },
    [capture, graphViewMode, setGraphViewMode, analyticsDimensions],
  );

  // Playback is a Graph-only feature (its controls mount below via
  // `transport`), but the playhead store outlives this component — it is
  // owned by PlayheadProvider one level up, so it keeps sweeping in the
  // background if left running when the user switches away from Graph.
  // Stop and reset it here so playback never outlives the view it belongs to.
  useEffect(() => () => stopPlayback(), [stopPlayback]);

  // Stable element so the memoized graph does not re-render on every hover
  // move (the hover state above lives in this wrapper).
  const transport = useMemo(() => <PlaybackControls />, []);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-muted-foreground text-sm">Loading graph...</span>
      </div>
    );
  }

  if (agentGraphData.length === 0) {
    return null;
  }

  return (
    <>
      <TraceGraphViewComponent
        agentGraphData={agentGraphData}
        activeObservationIds={activeObservationIds}
        viewMode={graphViewMode}
        onViewModeChange={handleViewModeChange}
        onObservationSelect={handleObservationSelect}
        transport={transport}
        onNodeHover={setHovered}
      />
      {hovered && hoveredNode ? (
        <Layer name="tooltip">
          <div
            className={cn(
              NODE_HOVER_CARD_SURFACE_CLASS,
              "pointer-events-none fixed",
            )}
            style={tooltipStyle(
              tooltipPlacement({
                clientX: hovered.clientX,
                clientY: hovered.clientY,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
              }),
            )}
          >
            <NodeHoverCardContent node={hoveredNode} />
          </div>
        </Layer>
      ) : null}
    </>
  );
}
