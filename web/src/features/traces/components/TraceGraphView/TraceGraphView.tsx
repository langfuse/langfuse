/* eslint-disable @repo/no-null-render */
/**
 * TraceGraphView wrapper
 *
 * This component wraps the TraceGraphView from features/trace-graph-view/
 * and uses data from GraphDataContext.
 */

import { useCallback } from "react";
import {
  TraceGraphView as TraceGraphViewComponent,
  type GraphViewMode,
} from "@/src/features/trace-graph-view";
import { useTraceGraphData } from "@/src/features/traces/contexts/TraceGraphDataContext";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useTraceAnalyticsDimensions } from "@/src/features/traces/hooks/useTraceAnalyticsDimensions";
import { useTraceSearchMatches } from "@/src/features/traces/hooks/useTraceSearchMatches";
import { useSelection } from "../../contexts/SelectionContext";

export function TraceGraphView() {
  const {
    defaultObservationId,
    selectedNodeId,
    setSelectedNodeId,
    selectNode,
  } = useSelection();
  const { agentGraphData, isLoading } = useTraceGraphData();
  const { graphViewMode, setGraphViewMode } = useViewPreferences();
  // The trace panel's search box, resolved by the same hook the Timeline reads.
  // The graph projects these observation ids onto its own nodes, which is
  // view-mode dependent and therefore its job, not this wrapper's.
  const search = useTraceSearchMatches();
  const capture = usePostHogClientCapture();
  const analyticsDimensions = useTraceAnalyticsDimensions();
  // Analytics live here (not in the feature component) so the feature module
  // stays free of trace-view context dependencies.
  const handleObservationSelect = useCallback(() => {
    capture("trace_detail:node_selected", {
      source: "graph",
      graphViewMode,
      ...analyticsDimensions,
    });
  }, [capture, graphViewMode, analyticsDimensions]);
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
  const handleSelectedObservationChange = useCallback(
    (id: string | null) => {
      // Synthetic graph nodes clear selection without opening details.
      if (id === null) {
        setSelectedNodeId(null);
        return;
      }
      selectNode(id);
    },
    [setSelectedNodeId, selectNode],
  );

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
    <TraceGraphViewComponent
      selectedObservationId={selectedNodeId}
      defaultObservationId={defaultObservationId}
      onSelectedObservationChange={handleSelectedObservationChange}
      agentGraphData={agentGraphData}
      viewMode={graphViewMode}
      onViewModeChange={handleViewModeChange}
      onObservationSelect={handleObservationSelect}
      search={
        search
          ? { matchedObservationIds: search.matchedIds, label: search.label }
          : undefined
      }
    />
  );
}
