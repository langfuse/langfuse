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
 * Expanded ("as it ran") graph builders: one node per observation `id` —
 * repeated calls become distinct numbered nodes instead of collapsing into a
 * single `name (3/3)` vertex, so loops unroll into an acyclic DAG.
 *
 * Two edge strategies (see GraphViewMode in types.ts):
 * - "steps": reuse the step numbers already present on the normalized data
 *   (timing-inferred by buildStepData, or explicit LangGraph metadata) and
 *   connect consecutive step groups. Same sequencing model as the aggregated
 *   view, just not collapsed by name.
 * - "flow": edges from real structure only — a child hangs off its parent
 *   (descent into a subtree) or off the sibling(s) that actually finished
 *   before it started (fork/join derived from timing). No step inference.
 */
export type ExpandedGraphVariant = "steps" | "flow";

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

function byStartThenId(
  a: AgentGraphDataResponse,
  b: AgentGraphDataResponse,
): number {
  return startMs(a) - startMs(b) || a.id.localeCompare(b.id);
}

/**
 * Consecutive step groups, all-to-all — the aggregated view's sequencing
 * keyed by id instead of name, so repeats stay distinct and steps strictly
 * increase (never cyclic).
 */
function buildStepEdges(observations: AgentGraphDataResponse[]): Edge[] | null {
  const stepToIds = new Map<number, string[]>();
  for (const obs of observations) {
    if (obs.step === null) continue; // post-normalization every obs has one
    const ids = stepToIds.get(obs.step);
    if (ids) ids.push(obs.id);
    else stepToIds.set(obs.step, [obs.id]);
  }

  const sortedSteps = [...stepToIds.entries()].sort(([a], [b]) => a - b);
  const edges: Edge[] = [];
  for (let i = 0; i < sortedSteps.length - 1; i++) {
    if (edges.length > MAX_EXPANDED_EDGES) return null;
    for (const from of sortedSteps[i][1]) {
      for (const to of sortedSteps[i + 1][1]) {
        edges.push({ from, to });
      }
    }
  }
  return edges.length > MAX_EXPANDED_EDGES ? null : edges;
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
    const ordered = [...group].sort(byStartThenId);
    // Precomputed times + index loops: the scan is O(n²) in the group size
    // and must stay allocation-free to be instant at the 5000-observation
    // panel cap (a naive slice/filter per element takes seconds there).
    const starts = ordered.map(startMs);
    const ends = ordered.map(endMs);
    for (let i = 0; i < ordered.length; i++) {
      if (edges.length > MAX_EXPANDED_EDGES) return null;
      const current = ordered[i];
      // Bounds over the siblings that finished before this one started
      // ("happened before"): the latest such start and end.
      let finishedCount = 0;
      let maxStart = -Infinity;
      let maxEnd = -Infinity;
      let latestFallback = -1;
      for (let j = 0; j < i; j++) {
        if (ends[j] > starts[i]) continue;
        finishedCount++;
        if (starts[j] > maxStart) maxStart = starts[j];
        if (ends[j] >= maxEnd) {
          maxEnd = ends[j];
          latestFallback = j;
        }
      }
      if (finishedCount === 0) {
        // Nothing precedes it in this scope: descend from the parent. Root
        // group sources get no edge — __start__ wiring covers them.
        if (parentId !== null) edges.push({ from: parentId, to: current.id });
        continue;
      }
      // Direct predecessors only (transitive reduction of the interval
      // order): keep those still running when the latest predecessor
      // started — anything that ended before then is implied transitively.
      // When the frontier is an instant (zero-duration, still-running, or
      // same-millisecond siblings) that set is EMPTY (nothing ends after the
      // instant's start); fall back to one edge from the latest-ending
      // predecessor so a chain of instants stays a chain instead of
      // orphaning every successor onto __start__.
      if (maxEnd > maxStart) {
        for (let j = 0; j < i; j++) {
          if (ends[j] > starts[i] || ends[j] <= maxStart) continue;
          edges.push({ from: ordered[j].id, to: current.id });
          if (parentId === null) rootSiblingFroms.add(ordered[j].id);
        }
      } else {
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
  variant: ExpandedGraphVariant,
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
  const observations = [...byId.values()].sort(byStartThenId);

  if (observations.length === 0) {
    return { graph: { nodes: [], edges: [] }, nodeToObservationsMap: {} };
  }

  // Number repeated names in run order — "litellm_request (2)" — so identical
  // calls stay tellable apart. Numbering is time-based (not variant-based) so
  // switching edge strategies never renumbers nodes.
  const nameTotals = new Map<string, number>();
  for (const obs of observations) {
    nameTotals.set(obs.name, (nameTotals.get(obs.name) ?? 0) + 1);
  }
  const nameSeen = new Map<string, number>();
  const nodes: GraphNodeData[] = observations.map((obs) => {
    const occurrence = (nameSeen.get(obs.name) ?? 0) + 1;
    nameSeen.set(obs.name, occurrence);
    return {
      id: obs.id,
      label: obs.name,
      type: obs.observationType,
      counter:
        (nameTotals.get(obs.name) ?? 0) > 1 ? ` (${occurrence})` : undefined,
    };
  });

  let edges: Edge[];
  let sinkIds: Set<string> | null = null;
  if (variant === "steps") {
    const built = buildStepEdges(observations);
    if (built === null) return EDGE_LIMIT_RESULT;
    edges = built;
  } else {
    const built = buildFlowEdges(observations, ancestry);
    if (built === null) return EDGE_LIMIT_RESULT;
    edges = built.edges;
    sinkIds = built.sinkIds;
  }

  // Synthetic entry/exit anchors, derived from the built edges: __start__
  // feeds every source; sinks feed __end__. In flow mode nested leaves always
  // have an incoming parent/sibling edge, so sources are naturally the
  // root-level heads, and buildFlowEdges caps sinks to the end of the
  // root-level run so a bushy tree's every leaf doesn't converge on __end__.
  const hasIncoming = new Set(edges.map((edge) => edge.to));
  const hasOutgoing = new Set(edges.map((edge) => edge.from));
  const sources = observations.filter((obs) => !hasIncoming.has(obs.id));
  const sinks = observations.filter((obs) =>
    sinkIds === null ? !hasOutgoing.has(obs.id) : sinkIds.has(obs.id),
  );

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
