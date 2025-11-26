/**
 * TracePanelDetail - Pure content component for detail panel
 *
 * Responsibility:
 * - Decide which detail view to show (Trace/Observation)
 * - Minimal wrapper (scrollable container) for layout consistency
 *
 * Hooks:
 * - useSelection() - for selected node state
 * - useTraceData() - for trace, nodeMap, observations, scores
 *
 * Re-renders when:
 * - Selection changes (clicking nodes)
 * - Trace data changes (rare)
 * - Does NOT re-render when search changes (isolated)
 */

import { useSelection } from "../../contexts/SelectionContext";
import { useTraceData } from "../../contexts/TraceDataContext";
import { TraceDetailView } from "../TraceDetailView/TraceDetailView";
import { ObservationDetailView } from "../ObservationDetailView/ObservationDetailView";
import { useMemo } from "react";

export function TracePanelDetail() {
  const { selectedNodeId } = useSelection();
  const { trace, nodeMap, observations, scores } = useTraceData();

  // Memoize to prevent recreation when deps haven't changed
  const content = useMemo(() => {
    const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;
    const isObservationSelected =
      selectedNodeId !== null && selectedNode?.type !== "TRACE";

    if (isObservationSelected && selectedNode) {
      // Find the full observation data from observations array
      const observationData = observations.find(
        (obs) => obs.id === selectedNode.id,
      );

      if (!observationData) {
        return (
          <div className="flex h-full w-full items-center justify-center p-4">
            <p className="text-sm text-muted-foreground">
              Observation not found
            </p>
          </div>
        );
      }

      return (
        <ObservationDetailView
          observation={observationData}
          projectId={trace.projectId}
          traceId={trace.id}
        />
      );
    }

    return (
      <TraceDetailView
        trace={trace}
        observations={observations}
        scores={scores}
        projectId={trace.projectId}
      />
    );
  }, [selectedNodeId, nodeMap, trace, observations, scores]);

  return (
    <div className="h-full w-full overflow-y-auto bg-background">{content}</div>
  );
}
