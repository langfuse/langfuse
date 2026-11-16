import { traceNodeId } from "./treeBuilding";

export function resolveTraceScopeSelection(
  selectedNodeId: string | readonly string[] | undefined,
  observations: readonly { id: string; traceId?: string | null }[],
  sessionTraces: readonly { id: string }[],
) {
  if (typeof selectedNodeId !== "string") return undefined;

  // Loaded rows take precedence: observation IDs can contain ':' or 'trace-'.
  const observation =
    observations.find(
      (entry) => `${entry.traceId}:${entry.id}` === selectedNodeId,
    ) ?? observations.find((entry) => entry.id === selectedNodeId);
  if (observation) {
    return {
      traceId: observation.traceId ?? null,
      observationId: observation.id,
    };
  }

  const traceIds = new Set(sessionTraces.map((trace) => trace.id));
  for (const entry of observations) {
    if (entry.traceId) traceIds.add(entry.traceId);
  }
  const traceId = [...traceIds].find(
    (id) => traceNodeId(id) === selectedNodeId,
  );
  if (traceId) return { traceId, observationId: null };

  // Use a known, longest trace prefix rather than splitting arbitrary IDs.
  const qualifiedTraceId = [...traceIds]
    .sort((a, b) => b.length - a.length)
    .find(
      (id) =>
        selectedNodeId.startsWith(`${id}:`) &&
        selectedNodeId.length > id.length + 1,
    );
  if (!qualifiedTraceId) return undefined;
  return {
    traceId: qualifiedTraceId,
    observationId: selectedNodeId.slice(qualifiedTraceId.length + 1),
  };
}
