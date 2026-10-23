/* eslint-disable @typescript-eslint/no-use-before-define */
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
import { SkeletonGroup } from "@/src/components/ui/skeleton";
import { TraceDetailView } from "./TraceDetailView/TraceDetailView";
import { ConnectedObservationDetailView } from "./ObservationDetailView/ConnectedObservationDetailView";
import { useMemo } from "react";
import { traceNodeId } from "../fns/treeBuilding";
import { useTraceDetailData } from "../hooks/useTraceDetailData";

function PanelMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-center">
      <p className="text-sm font-bold">{title}</p>
      <p className="text-muted-foreground max-w-sm text-sm">{body}</p>
    </div>
  );
}

export function TracePanelDetail({
  isLoading = false,
}: {
  isLoading?: boolean;
}) {
  return (
    <div className="bg-surface-sunken h-full w-full overflow-y-auto [--surface-context:hsl(var(--surface-sunken))]">
      {isLoading ? <TraceDetailView isLoading /> : <TracePanelDetailContent />}
    </div>
  );
}

function TracePanelDetailContent() {
  const { selectedNodeId } = useSelection();
  const {
    trace: anchorTrace,
    sessionTraces,
    observations,
    serverScores: scores,
    corrections,
    isPlaceholderData,
  } = useTraceData();
  const trace =
    sessionTraces?.find((entry) => traceNodeId(entry.id) === selectedNodeId) ??
    anchorTrace;
  const traceObservations = useMemo(
    () =>
      observations.filter((observation) => observation.traceId === trace.id),
    [observations, trace.id],
  );

  // Resolved from the selected id, not from the tree: the observation list is
  // capped, so a selected observation may be missing from the tree while its
  // data is perfectly fetchable.
  const selected = useSelectedObservation({
    selectedNodeId,
    traceId: trace.id,
    projectId: trace.projectId,
    observations,
    enabled: !isPlaceholderData,
  });

  // Memoize to prevent recreation when deps haven't changed
  return useMemo(() => {
    switch (selected.kind) {
      case "observation":
        return (
          <ConnectedObservationDetailView
            observation={selected.observation}
            projectId={trace.projectId}
            traceId={selected.observation.traceId}
          />
        );
      case "loading":
        // The observation view shares this shell, so nothing moves when it lands.
        return (
          <SkeletonGroup className="h-full w-full">
            <TraceDetailView isLoading />
          </SkeletonGroup>
        );
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
        if (trace.id !== anchorTrace.id) {
          return (
            <ConnectedSessionTraceDetail
              projectId={trace.projectId}
              traceId={trace.id}
              timestamp={trace.timestamp}
            />
          );
        }
        return (
          <TraceDetailView
            trace={trace}
            observations={traceObservations}
            scores={scores.filter((score) => score.traceId === trace.id)}
            corrections={corrections.filter(
              (score) => score.traceId === trace.id,
            )}
            projectId={trace.projectId}
          />
        );
    }
  }, [selected, trace, anchorTrace.id, traceObservations, scores, corrections]);
}

function ConnectedSessionTraceDetail({
  projectId,
  traceId,
  timestamp,
}: {
  projectId: string;
  traceId: string;
  timestamp: Date;
}) {
  const result = useTraceDetailData({ projectId, traceId, timestamp });
  if (result.isError) {
    return (
      <PanelMessage
        title="Could not load trace"
        body="Loading this trace failed. Reload the page to try again."
      />
    );
  }
  if (result.isNotFound) {
    return (
      <PanelMessage
        title="Trace not found"
        body="This trace may have been deleted."
      />
    );
  }
  if (!result.data || result.isPlaceholderData || result.data.id !== traceId) {
    return <TraceDetailView isLoading />;
  }
  return (
    <TraceDetailView
      trace={result.data}
      observations={result.data.observations}
      scores={result.data.scores}
      corrections={result.data.corrections}
      projectId={projectId}
    />
  );
}
