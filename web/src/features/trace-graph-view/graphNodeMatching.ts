/**
 * Which graph node an observation belongs to, and which nodes a search lights.
 *
 * A graph node is not an observation. In the aggregated view one node stands
 * for every call of a step; in either view the graph drops observations
 * entirely (EVENTs, LangGraph child spans, nested same-name calls), and
 * `nodeToObservationsMap` only registers the top-most of a same-name chain. So
 * "which node is this observation?" has a real answer for observations no node
 * claims — the nearest ANCESTOR that has one — and that answer has to be the
 * same whether the observation arrived from a click or from a search. One
 * resolver, used by both, is how that stays true.
 *
 * What counts as a matching observation is not decided here: that stays with
 * `matchesSearchQuery`, so the graph, the timeline and the flat result list
 * cannot disagree about the rule or the count.
 */

/** The lookups the ancestor walk needs, in whichever view mode is active. */
export type GraphNodeResolution = {
  /** Expanded: node ids ARE observation ids. Aggregated: node ids are step names. */
  isExpanded: boolean;
  /**
   * Observations by id, UNFILTERED — the chain to walk up. Filtered data would
   * break the walk at exactly the observations that need it.
   */
  observationsById: ReadonlyMap<
    string,
    {
      id: string;
      parentObservationId: string | null;
      node: string | null;
    }
  >;
  /** Node ids present in the laid-out graph. */
  graphNodeIds: ReadonlySet<string>;
  /** Observation id → its step name, from the normalized data (aggregated). */
  nodeByObservationId: ReadonlyMap<string, string>;
};

export function nearestGraphNodeName(
  observationId: string,
  {
    isExpanded,
    observationsById,
    graphNodeIds,
    nodeByObservationId,
  }: GraphNodeResolution,
): string | null {
  // Aggregated: the observation's own step name, when it has one.
  if (!isExpanded) {
    const own = nodeByObservationId.get(observationId);
    if (own) return own;
  }
  // Walk up to the nearest ancestor the graph DID keep. `seen` guards a cycle
  // in the parent references rather than trusting the data to be a tree.
  const seen = new Set<string>();
  let cursor = observationsById.get(observationId);
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (isExpanded ? graphNodeIds.has(cursor.id) : cursor.node) {
      return isExpanded ? cursor.id : cursor.node;
    }
    cursor = cursor.parentObservationId
      ? observationsById.get(cursor.parentObservationId)
      : undefined;
  }
  return null;
}

export function matchedGraphNodeNames({
  matchedObservationIds,
  nodeToObservationsMap,
  resolution,
}: {
  matchedObservationIds: ReadonlySet<string>;
  nodeToObservationsMap: Record<string, string[]>;
  resolution: GraphNodeResolution;
}): Set<string> {
  const lit = new Set<string>();
  // Nothing matched, so no node can be lit by association. An empty set, not
  // "no search": the caller's `search` prop says whether a query is live, and a
  // query with no hits must still dim everything.
  if (matchedObservationIds.size === 0) return lit;

  // One index over the map instead of a scan per hit.
  const claimedBy = new Map<string, string>();
  for (const [nodeName, observationIds] of Object.entries(
    nodeToObservationsMap,
  )) {
    for (const id of observationIds) {
      if (!claimedBy.has(id)) claimedBy.set(id, nodeName);
    }
  }

  for (const id of matchedObservationIds) {
    const nodeName = claimedBy.get(id) ?? nearestGraphNodeName(id, resolution);
    // A resolved name still has to be a node that was laid out — an ancestor
    // can carry a step name the graph never drew.
    if (nodeName && resolution.graphNodeIds.has(nodeName)) lit.add(nodeName);
  }
  return lit;
}
