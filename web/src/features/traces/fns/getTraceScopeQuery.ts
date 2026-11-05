import { type ParsedUrlQuery } from "querystring";

export function getTraceScopeQuery(
  query: ParsedUrlQuery,
  scope: "trace" | "session",
  observations: readonly { id: string; traceId?: string | null }[] = [],
) {
  const next = { ...query };
  if (scope === "session") {
    next.aggregation = "session";
    return next;
  }
  delete next.aggregation;
  const selectedObservation =
    observations.find(
      (observation) =>
        `${observation.traceId}:${observation.id}` === next.observation,
    ) ??
    observations.find((observation) => observation.id === next.observation);
  if (!selectedObservation) {
    delete next.observation;
    return next;
  }

  next.observation = selectedObservation.id;
  if (!selectedObservation.traceId) return next;

  const currentTraceId = next.traceId ?? next.peek;
  if (currentTraceId !== selectedObservation.traceId) delete next.timestamp;

  if (next.peek !== undefined) {
    if (typeof next.traceId === "string") {
      next.peek = selectedObservation.id;
      next.traceId = selectedObservation.traceId;
    } else {
      next.peek = selectedObservation.traceId;
    }
  } else {
    next.traceId = selectedObservation.traceId;
  }
  return next;
}
