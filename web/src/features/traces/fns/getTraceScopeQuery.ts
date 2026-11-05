import { type ParsedUrlQuery } from "querystring";

export function getTraceScopeQuery(
  query: ParsedUrlQuery,
  scope: "trace" | "session",
  observations: readonly { id: string }[] = [],
) {
  const next = { ...query };
  if (scope === "session") {
    next.aggregation = "session";
    return next;
  }
  delete next.aggregation;
  if (
    !observations.some((observation) => observation.id === next.observation)
  ) {
    delete next.observation;
  }
  return next;
}
