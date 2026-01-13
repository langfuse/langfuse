/**
 * TraceGraphView wrapper for trace2
 *
 * This component wraps the TraceGraphView from features/trace-graph-view/
 * and uses data from GraphDataContext.
 */

import { TraceGraphView as TraceGraphViewComponent } from "@/src/features/trace-graph-view/components/TraceGraphView";
import { useTraceGraphData } from "../../contexts/TraceGraphDataContext";

export function TraceGraphView() {
  const { agentGraphData, isLoading } = useTraceGraphData();

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-sm text-muted-foreground">Loading graph...</span>
      </div>
    );
  }

  if (agentGraphData.length === 0) {
    return null;
  }

  return <TraceGraphViewComponent agentGraphData={agentGraphData} />;
}
