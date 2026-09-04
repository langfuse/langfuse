/**
 * TracePanelDetail - Pure content component for detail panel
 *
 * Responsibility:
 * - Decide which detail view to show (Trace/Observation)
 * - Minimal wrapper (scrollable container) for layout consistency
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
  const {
    trace,
    observations,
    serverScores: scores,
    corrections,
  } = useTraceData();

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
    <div className="bg-background h-full w-full overflow-y-auto">{content}</div>
  );
}
