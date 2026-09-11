/**
 * Which graph nodes answer the trace panel's search box.
 *
 * A graph node is not an observation: in the aggregated view one node stands
 * for every call of a step, so "does this node match" can only mean "does ANY
 * of the observations behind it match". That projection is this function, and
 * it is the only thing the graph needs to know about searching — what counts
 * as a matching OBSERVATION stays with `matchesSearchQuery`, so the graph, the
 * timeline and the flat result list cannot disagree about the rule or the
 * count.
 *
 * Nodes with no observations behind them — the synthetic `__start__` and
 * `__end__` markers — never match. They are not things anybody searched for.
 */
export function matchedGraphNodeNames(
  nodeToObservationsMap: Record<string, string[]>,
  matchedObservationIds: ReadonlySet<string>,
): Set<string> {
  const names = new Set<string>();
  // Nothing matched, so no node can be lit by association. Returned as an
  // empty set rather than "no search": the caller's `search` prop is what says
  // whether a query is live, and "a query with no hits" must still dim
  // everything.
  if (matchedObservationIds.size === 0) return names;
  for (const [nodeName, observationIds] of Object.entries(
    nodeToObservationsMap,
  )) {
    if (observationIds.some((id) => matchedObservationIds.has(id))) {
      names.add(nodeName);
    }
  }
  return names;
}
