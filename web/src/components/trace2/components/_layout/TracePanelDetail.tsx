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
import { useMemo, useEffect } from "react";

export function TracePanelDetail() {
  const { selectedNodeId, setSelectedNodeId } = useSelection();
  const {
    trace,
    roots,
    nodeMap,
    observations,
    serverScores: scores,
    corrections,
  } = useTraceData();

  // Auto-select first root observation when roots are observations (not TRACE wrapped)
  // This happens for events-based traces with observation roots
  useEffect(() => {
    if (!selectedNodeId && roots.length > 0 && roots[0].type !== "TRACE") {
      setSelectedNodeId(roots[0].id);
    }
  }, [selectedNodeId, roots, setSelectedNodeId]);

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
        corrections={corrections}
        projectId={trace.projectId}
      />
    );
  }, [selectedNodeId, nodeMap, trace, observations, scores, corrections]);

  return (
    <div className="h-full w-full overflow-y-auto bg-background">{content}</div>
  );
}
