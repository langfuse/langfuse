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
      // TODO: Replace with ObservationDetailView in Phase 3
      return (
        <div className="p-4">
          <h2 className="text-lg font-semibold">Observation Details</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Selected: {selectedNode.name} ({selectedNode.type})
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ID: {selectedNode.id}
          </p>
        </div>
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
