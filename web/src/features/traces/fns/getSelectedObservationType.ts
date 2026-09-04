import { type ObservationType } from "@langfuse/shared";
import { traceDetailTitle } from "@/src/features/traces/fns/traceDetailTitle";

export function getSelectedObservation<
  T extends {
    id: string;
    name?: string | null;
    traceId?: string | null;
    type: ObservationType;
  },
>(
  observations: ReadonlyArray<T> | undefined,
  selectedNodeId: string | undefined,
) {
  if (!selectedNodeId) return null;

  return (
    observations?.find(
      (observation) =>
        observation.id === selectedNodeId ||
        `${observation.traceId}:${observation.id}` === selectedNodeId,
    ) ?? null
  );
}

export function getSelectedObservationType(
  observations:
    | ReadonlyArray<{
        id: string;
        traceId?: string | null;
        type: ObservationType;
      }>
    | undefined,
  selectedNodeId: string | undefined,
) {
  return getSelectedObservation(observations, selectedNodeId)?.type ?? null;
}

export function canSelectObservationView(selectedNodeId: string | undefined) {
  if (!selectedNodeId) return false;
  if (selectedNodeId.startsWith("trace-")) return false;
  if (selectedNodeId.startsWith("session-")) return false;
  return true;
}

export function getTraceDetailModeTitle(
  aggregationLevel: "trace" | "session" | "observation",
  trace:
    | {
        id: string;
        name?: string | null;
        sessionId?: string | null;
      }
    | undefined,
  selectedObservation: { id: string; name?: string | null } | null,
  fallback: string | undefined,
) {
  if (aggregationLevel === "observation") {
    return selectedObservation?.name || selectedObservation?.id || fallback;
  }
  if (aggregationLevel === "session") {
    return trace?.sessionId || traceDetailTitle(trace, fallback);
  }
  return traceDetailTitle(trace, fallback);
}
