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

export function PreviewPanel() {
  const { selectedNodeId } = useSelection();
  const { trace, nodeMap } = useTraceData();

  // Determine what to show
  const isObservationSelected = selectedNodeId !== null;
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;

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
        // TODO: Replace with TraceDetailView
        <div className="p-4">
          <h2 className="text-lg font-semibold">Trace Details</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Trace: {trace.name || trace.id}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">ID: {trace.id}</p>
        </div>
      )}
    </div>
  );
}
