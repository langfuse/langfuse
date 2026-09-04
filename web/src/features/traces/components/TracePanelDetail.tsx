/**
 * TracePanelDetail - Pure content component for detail panel
 *
 * Responsibility:
 * - Decide which detail view to show (Trace/Observation)
 * - Keep the trace summary visible above the selected detail view
 * - Delegate scrolling to the selected detail view
 *
 * Hooks:
 * - useSelection() - for selected node state
 * - useTraceData() - for trace, observations, scores
 * - useSelectedObservation() - resolves the selected observation off the tree
 *
 * Re-renders when:
 * - Selection changes (clicking nodes)
 * - Trace data changes (rare)
 * - Does NOT re-render when search changes (isolated)
 */

import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useSelectedObservation } from "@/src/features/traces/hooks/useSelectedObservation";
import { Skeleton } from "@/src/components/ui/skeleton";
import { TraceDetailView } from "./TraceDetailView/TraceDetailView";
import { ConnectedObservationDetailView } from "./ObservationDetailView/ConnectedObservationDetailView";
import { useMemo } from "react";
import { TraceSummaryBar } from "@/src/features/traces/components/TraceSummaryBar";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";

function PanelMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-center">
      <p className="text-sm font-bold">{title}</p>
      <p className="text-muted-foreground max-w-sm text-sm">{body}</p>
    </div>
  );
}

export function TracePanelDetail() {
  const { selectedNodeId } = useSelection();
  const { isAnnotationMode } = useViewPreferences();
  const {
    trace,
    observations,
    serverScores: scores,
    corrections,
    aggregatedMetrics,
  } = useTraceData();
  const hasTraceSummary =
    trace.latency != null ||
    Boolean(trace.sessionId) ||
    Boolean(trace.userId) ||
    (aggregatedMetrics.totalCost != null &&
      aggregatedMetrics.costDetails != null);

  // Resolved from the selected id, not from the tree: the observation list is
  // capped, so a selected observation may be missing from the tree while its
  // data is perfectly fetchable.
  const selected = useSelectedObservation({
    selectedNodeId,
    traceId: trace.id,
    projectId: trace.projectId,
    observations,
  });

  // Memoize to prevent recreation when deps haven't changed
  const content = useMemo(() => {
    switch (selected.kind) {
      case "observation":
        return (
          <ConnectedObservationDetailView
            observation={selected.observation}
            projectId={trace.projectId}
            traceId={trace.id}
          />
        );
      case "loading":
        return <Skeleton className="h-full w-full rounded-none" />;
      case "not-found":
        return (
          <PanelMessage
            title="Observation not found"
            body="This observation is not part of this trace. It may have been deleted."
          />
        );
      case "error":
        return (
          <PanelMessage
            title="Could not load observation"
            body="Loading this observation failed. Reload the page to try again."
          />
        );
      case "trace":
        return (
          <TraceDetailView
            trace={trace}
            observations={observations}
            scores={scores}
            corrections={corrections}
            projectId={trace.projectId}
          />
        );
    }
  }, [selected, trace, observations, scores, corrections]);

  return (
    <div className="bg-background flex h-full w-full flex-col overflow-hidden">
      {!isAnnotationMode && hasTraceSummary ? (
        <TraceSummaryBar
          projectId={trace.projectId}
          latencySeconds={trace.latency ?? null}
          sessionId={trace.sessionId}
          userId={trace.userId}
          totalCost={aggregatedMetrics.totalCost}
          costDetails={aggregatedMetrics.costDetails}
        />
      ) : null}
      <div className="min-h-0 flex-1">{content}</div>
    </div>
  );
}
