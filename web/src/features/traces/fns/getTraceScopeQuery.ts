import { type ParsedUrlQuery } from "querystring";
import { resolveTraceScopeSelection } from "./resolveTraceScopeSelection";

export function getTraceScopeQuery(
  query: ParsedUrlQuery,
  scope: "trace" | "session",
  observations: Parameters<typeof resolveTraceScopeSelection>[1] = [],
  sessionTraces: Parameters<typeof resolveTraceScopeSelection>[2] = [],
) {
  const next = { ...query };
  if (scope === "session") {
    next.aggregation = "session";
    return next;
  }
  delete next.aggregation;
  const selection = resolveTraceScopeSelection(
    next.observation,
    observations,
    sessionTraces,
  );
  if (!selection) {
    delete next.observation;
    return next;
  }

  if (selection.observationId === null) {
    delete next.observation;
  } else {
    next.observation = selection.observationId;
  }
  if (!selection.traceId) return next;

  const currentTraceId = next.traceId ?? next.peek;
  if (currentTraceId === selection.traceId) return next;

  delete next.timestamp;
  if (next.peek === undefined) {
    next.traceId = selection.traceId;
    return next;
  }
  if (typeof next.traceId === "string" && selection.observationId !== null) {
    next.peek = selection.observationId;
    next.traceId = selection.traceId;
    return next;
  }
  // A trace-root selection has no observation row to use as the peek anchor.
  next.peek = selection.traceId;
  delete next.traceId;
  return next;
}
