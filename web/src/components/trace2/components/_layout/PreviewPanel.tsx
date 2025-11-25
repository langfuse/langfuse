/**
 * PreviewPanel - Right panel that shows trace or observation details
 *
 * Purpose:
 * - Read selectedNodeId from SelectionContext
 * - Show TraceDetailView when no observation selected
 * - Show ObservationDetailView when observation selected
 *
 * Layout: Full height scrollable container
 */

import { useSelection } from "../../contexts/SelectionContext";
import { useTraceData } from "../../contexts/TraceDataContext";
import { TraceDetailView } from "../TraceDetailView";

export function PreviewPanel() {
  const { selectedNodeId } = useSelection();
  const { trace, nodeMap, observations, scores } = useTraceData();

  // Determine what to show
  // Note: Trace root node has type "TRACE", observations have other types (SPAN, GENERATION, EVENT)
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;
  const isObservationSelected =
    selectedNodeId !== null && selectedNode?.type !== "TRACE";

  return (
    <div className="h-full w-full overflow-y-auto bg-background">
      {isObservationSelected && selectedNode ? (
        // TODO: Replace with ObservationDetailView
        <div className="p-4">
          <h2 className="text-lg font-semibold">Observation Details</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Selected: {selectedNode.name} ({selectedNode.type})
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ID: {selectedNode.id}
          </p>
        </div>
      ) : (
        <TraceDetailView
          trace={trace}
          observations={observations}
          scores={scores}
          projectId={trace.projectId}
        />
      )}
    </div>
  );
}
