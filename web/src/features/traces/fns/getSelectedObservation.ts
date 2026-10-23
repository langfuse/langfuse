export function getSelectedObservation<
  T extends { id: string; traceId: string },
>(observations: T[], selectedNodeId: string | null, traceId: string) {
  if (!selectedNodeId) return undefined;
  return (
    observations.find(
      (observation) =>
        observation.id === selectedNodeId && observation.traceId === traceId,
    ) ??
    observations.find(
      (observation) =>
        observation.id === selectedNodeId ||
        `${observation.traceId}:${observation.id}` === selectedNodeId,
    )
  );
}
