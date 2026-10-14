import {
  type AgentGraphDataResponse,
  type GraphNodeData,
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
  LANGGRAPH_START_NODE_NAME,
  LANGGRAPH_END_NODE_NAME,
} from "./types";
import { type GraphParseResult } from "./buildGraphCanvasData";

/**
 * Expanded ("as it ran") graph builder: one node per observation `id` —
 * repeated calls become distinct nodes instead of collapsing into a single
 * `name (3/3)` vertex, so loops unroll into an acyclic DAG (which call is
 * which reads off the run order of the layout).
 *
 * The instrumented hierarchy is the source of truth: a child hangs off its
 * parent (descent into a subtree) or off the sibling(s) that actually
 * finished before it started (fork/join derived from timing, only ever
 * within one parent's scope). No step inference, no framework metadata.
 */
const SYSTEM_NODE_IDS = new Set<string>([
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
  LANGGRAPH_START_NODE_NAME,
  LANGGRAPH_END_NODE_NAME,
]);

/**
 * Edge budget for expanded graphs. Consecutive parallel batches connect
 * all-to-all (N×M edges), so a wide trace can explode combinatorially —
 * ELK's layout cost grows super-linearly with edges and would freeze the
 * tab long before the 5000-observation panel cap kicks in. Builders bail
 * past the budget and the view shows a "too complex" notice instead. The
 * bound clears every linear shape under the panel's observation cap (a
 * 5000-call chain is ~5000 edges) and cuts off the quadratic ones.
 */
export const MAX_EXPANDED_EDGES = 10_000;

export interface ExpandedGraphResult extends GraphParseResult {
  /** True when the trace exceeded MAX_EXPANDED_EDGES — the graph is empty. */
  limitExceeded?: boolean;
}

type Edge = { from: string; to: string };

const EDGE_LIMIT_RESULT: ExpandedGraphResult = {
  graph: { nodes: [], edges: [] },
  nodeToObservationsMap: {},
  limitExceeded: true,
};

function startMs(obs: AgentGraphDataResponse): number {
  return new Date(obs.startTime).getTime();
}

/** Effective end: missing endTime counts as instant; inverted ranges clamp. */
function endMs(obs: AgentGraphDataResponse): number {
  const start = startMs(obs);
  const end = obs.endTime ? new Date(obs.endTime).getTime() : start;
  return Math.max(start, end);
}

/**
 * Run order for the sibling scan. The happened-before pass only looks
 * BACKWARDS (j < i), so it needs: x happened-before y (x.end ≤ y.start) ⇒
 * x sorts before y. Start alone doesn't guarantee that — a same-start
 * instant ends before its longer sibling STARTS, yet an id tiebreak could
 * sort it after, and the reduction would then drop edges citing a chain
 * that was never emitted. Tie-breaking by END fixes it: a same-start pair
 * can only be ordered (one an instant at the shared start), and the instant
 * has the smaller end. Same-instant ties (id tiebreak) are symmetric and
 * covered by the fallback chain.
 */
function byRunOrder(
  a: AgentGraphDataResponse,
  b: AgentGraphDataResponse,
): number {
  return (
    startMs(a) - startMs(b) || endMs(a) - endMs(b) || a.id.localeCompare(b.id)
  );
}

/**
 * Structural flow edges. Observations are grouped under their nearest included
 * ancestor (`ancestry` supplies parent links for observations filtered out of
 * the graph, e.g. EVENTs; unresolvable parents land in the root group). Within
 * a group, an observation connects from the sibling(s) that actually finished
 * before it started — reduced to the direct predecessors, so sequential work
 * chains, parallel work forks, and a later step joins the branches back. A
 * child no sibling precedes hangs off its parent (descent into the subtree).
 *
 * Also returns the root group's sinks (members with no outgoing SIBLING edge —
 * descent edges into children don't count) so the caller wires __end__ to the
 * end of the top-level run only, not to every nested leaf.
 */
function buildFlowEdges(
  observations: AgentGraphDataResponse[],
  ancestry: AgentGraphDataResponse[],
): { edges: Edge[]; sinkIds: Set<string> } | null {
  const included = new Set(observations.map((obs) => obs.id));
  const ancestryById = new Map(ancestry.map((obs) => [obs.id, obs]));

  const resolveParent = (obs: AgentGraphDataResponse): string | null => {
    const seen = new Set<string>();
    let parentId = obs.parentObservationId;
    while (parentId && !seen.has(parentId)) {
      if (included.has(parentId)) return parentId;
      seen.add(parentId);
      parentId = ancestryById.get(parentId)?.parentObservationId ?? null;
    }
    return null;
  };

  const groups = new Map<string | null, AgentGraphDataResponse[]>();
  for (const obs of observations) {
    const parent = resolveParent(obs);
    const group = groups.get(parent);
    if (group) group.push(obs);
    else groups.set(parent, [obs]);
  }

  const edges: Edge[] = [];
  const rootSiblingFroms = new Set<string>();
  for (const [parentId, group] of groups) {
    const ordered = [...group].sort(byRunOrder);
    // Precomputed times + index loops: the scan is O(n²) in the group size
    // and must stay allocation-free to be instant at the 5000-observation
    // panel cap (a naive slice/filter per element takes seconds there).
    const starts = ordered.map(startMs);
    const ends = ordered.map(endMs);
    for (let i = 0; i < ordered.length; i++) {
      if (edges.length > MAX_EXPANDED_EDGES) return null;
      const current = ordered[i];
      // Stats over the siblings that finished before this one started
      // ("happened before"): the latest end (fallback anchor) and the two
      // largest starts. Two, not one: the reduction predicate for a
      // predecessor p must range over the OTHER predecessors' starts — using
      // a single max would compare an instant against its own start and
      // wrongly drop its edge (p.end === p.start === max).
      let finishedCount = 0;
      let maxEnd = -Infinity;
      let latestFallback = -1;
      let maxStart = -Infinity;
      let maxStartIdx = -1;
      let secondMaxStart = -Infinity;
      for (let j = 0; j < i; j++) {
        if (ends[j] > starts[i]) continue;
        finishedCount++;
        if (ends[j] >= maxEnd) {
          maxEnd = ends[j];
          latestFallback = j;
        }
        if (starts[j] > maxStart) {
          secondMaxStart = maxStart;
          maxStart = starts[j];
          maxStartIdx = j;
        } else if (starts[j] > secondMaxStart) {
          secondMaxStart = starts[j];
        }
      }
      if (finishedCount === 0) {
        // Nothing precedes it in this scope: descend from the parent. Root
        // group sources get no edge — __start__ wiring covers them.
        if (parentId !== null) edges.push({ from: parentId, to: current.id });
        continue;
      }
      // Direct predecessors only (transitive reduction of the interval
      // order): keep p iff no OTHER predecessor fits entirely after it,
      // i.e. p.end > max(start of the others). When same-millisecond
      // instants tie for the latest start, every candidate fails the strict
      // check (nothing ends after the tied start) — fall back to one edge
      // from the latest-ending predecessor so a chain of instants stays a
      // chain instead of orphaning every successor onto __start__.
      let emitted = false;
      for (let j = 0; j < i; j++) {
        if (ends[j] > starts[i]) continue;
        const othersMaxStart = j === maxStartIdx ? secondMaxStart : maxStart;
        if (ends[j] > othersMaxStart) {
          edges.push({ from: ordered[j].id, to: current.id });
          if (parentId === null) rootSiblingFroms.add(ordered[j].id);
          emitted = true;
        }
      }
      if (!emitted) {
        edges.push({ from: ordered[latestFallback].id, to: current.id });
        if (parentId === null) {
          rootSiblingFroms.add(ordered[latestFallback].id);
        }
      }
    }
  }

  const sinkIds = new Set(
    (groups.get(null) ?? [])
      .filter((obs) => !rootSiblingFroms.has(obs.id))
      .map((obs) => obs.id),
  );
  return { edges, sinkIds };
}

/**
 * Build the expanded graph. `data` is the normalized observation list (the
 * same input the aggregated builder receives); `ancestry` optionally supplies
 * the unfiltered observations so parent chains can be walked through
 * observations that aren't part of the graph.
 */
export function buildExpandedGraph(
  data: AgentGraphDataResponse[],
  ancestry: AgentGraphDataResponse[] = data,
): ExpandedGraphResult {
  // Dedupe by id (re-seeded/duplicated ingestion can repeat ids) and drop the
  // synthetic system rows — start/end are re-derived from the edges below.
  const byId = new Map<string, AgentGraphDataResponse>();
  for (const obs of data) {
    if (!SYSTEM_NODE_IDS.has(obs.id) && !byId.has(obs.id)) {
      byId.set(obs.id, obs);
    }
  }
  const observations = [...byId.values()].sort(byRunOrder);

  if (observations.length === 0) {
    return { graph: { nodes: [], edges: [] }, nodeToObservationsMap: {} };
  }

  const nodes: GraphNodeData[] = observations.map((obs) => ({
    id: obs.id,
    label: obs.name,
    type: obs.observationType,
  }));

  const built = buildFlowEdges(observations, ancestry);
  if (built === null) return EDGE_LIMIT_RESULT;
  const { edges, sinkIds } = built;

  // Synthetic entry/exit anchors, derived from the built edges: __start__
  // feeds every source; sinks feed __end__. Nested leaves always have an
  // incoming parent/sibling edge, so sources are naturally the root-level
  // heads, and buildFlowEdges caps sinks to the end of the root-level run so
  // a bushy tree's every leaf doesn't converge on __end__.
  const hasIncoming = new Set(edges.map((edge) => edge.to));
  const sources = observations.filter((obs) => !hasIncoming.has(obs.id));
  const sinks = observations.filter((obs) => sinkIds.has(obs.id));

  nodes.unshift({
    id: LANGFUSE_START_NODE_NAME,
    label: LANGFUSE_START_NODE_NAME,
    type: "LANGGRAPH_SYSTEM",
  });
  nodes.push({
    id: LANGFUSE_END_NODE_NAME,
    label: LANGFUSE_END_NODE_NAME,
    type: "LANGGRAPH_SYSTEM",
  });
  for (const source of sources) {
    edges.push({ from: LANGFUSE_START_NODE_NAME, to: source.id });
  }
  for (const sink of sinks) {
    edges.push({ from: sink.id, to: LANGFUSE_END_NODE_NAME });
  }
  // Anchor wiring counts against the budget too (a degenerate trace of
  // isolated observations gets two anchor edges apiece).
  if (edges.length > MAX_EXPANDED_EDGES) return EDGE_LIMIT_RESULT;

  // One observation per node — clicking a node selects exactly that call.
  const nodeToObservationsMap: Record<string, string[]> = {};
  for (const obs of observations) {
    nodeToObservationsMap[obs.id] = [obs.id];
  }

  return { graph: { nodes, edges }, nodeToObservationsMap };
}
