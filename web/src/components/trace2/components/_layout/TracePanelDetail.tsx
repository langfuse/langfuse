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
    tree,
    nodeMap,
    observations,
    serverScores: scores,
    corrections,
  } = useTraceData();

  // Auto-select root observation when tree root is an observation (not TRACE)
  // This happens for events-based traces with a single root observation
  useEffect(() => {
    if (!selectedNodeId && tree.type !== "TRACE") {
      setSelectedNodeId(tree.id);
    }
  }, [selectedNodeId, tree.id, tree.type, setSelectedNodeId]);

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

      // Check if this observation is the tree root (events-based trace with single root)
      const isRoot = tree.type !== "TRACE" && selectedNodeId === tree.id;

      return (
        <ObservationDetailView
          observation={observationData}
          projectId={trace.projectId}
          traceId={trace.id}
          isRoot={isRoot}
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
  }, [selectedNodeId, nodeMap, trace, tree, observations, scores, corrections]);

  return (
    <div className="h-full w-full overflow-y-auto bg-background">{content}</div>
  );
}
