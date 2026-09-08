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
    activeTraceObservations,
    serverScores: scores,
    corrections,
    nodeMap,
    isTraceDetailLoading,
    isTraceDetailError,
  } = useTraceData();
  const selectedObservationId = selectedNodeId
    ? (nodeMap.get(selectedNodeId)?.observationId ?? selectedNodeId)
    : null;

  // Resolved from the selected id, not from the tree: the observation list is
  // capped, so a selected observation may be missing from the tree while its
  // data is perfectly fetchable.
  const selected = useSelectedObservation({
    selectedNodeId: selectedObservationId,
    traceId: trace.id,
    projectId: trace.projectId,
    observations: activeTraceObservations,
  });
  const traceObservations = activeTraceObservations;
  const traceScores = useMemo(
    () => scores.filter((score) => score.traceId === trace.id),
    [scores, trace.id],
  );
  const traceCorrections = useMemo(
    () => corrections.filter((correction) => correction.traceId === trace.id),
    [corrections, trace.id],
  );

  // Memoize to prevent recreation when deps haven't changed
  const content = useMemo(() => {
    if (isTraceDetailLoading) {
      return <Skeleton className="h-full w-full rounded-none" />;
    }
    if (isTraceDetailError) {
      return (
        <PanelMessage
          title="Could not load trace"
          body="Loading this trace failed. Reload the page to try again."
        />
      );
    }
    switch (selected.kind) {
      case "observation":
        return (
          <ConnectedObservationDetailView
            observation={selected.observation}
            projectId={trace.projectId}
            traceId={selected.observation.traceId ?? trace.id}
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
            observations={traceObservations}
            scores={traceScores}
            corrections={traceCorrections}
            projectId={trace.projectId}
          />
        );
    }
  }, [
    isTraceDetailLoading,
    isTraceDetailError,
    selected,
    trace,
    traceObservations,
    traceScores,
    traceCorrections,
  ]);

  return (
    <div className="bg-background h-full w-full overflow-y-auto">{content}</div>
  );
}
