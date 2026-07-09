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

type Edge = { from: string; to: string };

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
function buildStepEdges(observations: AgentGraphDataResponse[]): Edge[] {
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
    for (const from of sortedSteps[i][1]) {
      for (const to of sortedSteps[i + 1][1]) {
        edges.push({ from, to });
      }
    }
  }
  return edges;
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
): { edges: Edge[]; sinkIds: Set<string> } {
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
    for (let i = 0; i < ordered.length; i++) {
      const current = ordered[i];
      const currentStart = startMs(current);
      // Siblings that finished before this one started ("happened before").
      const finished = ordered
        .slice(0, i)
        .filter((prev) => endMs(prev) <= currentStart);
      if (finished.length === 0) {
        // Nothing precedes it in this scope: descend from the parent. Root
        // group sources get no edge — __start__ wiring covers them.
        if (parentId !== null) edges.push({ from: parentId, to: current.id });
        continue;
      }
      // Direct predecessors only (transitive reduction of the interval
      // order): drop any that finished before another predecessor STARTED —
      // the chain through that later one already implies the ordering.
      const latestStart = Math.max(...finished.map(startMs));
      for (const prev of finished) {
        if (endMs(prev) > latestStart) {
          edges.push({ from: prev.id, to: current.id });
          if (parentId === null) rootSiblingFroms.add(prev.id);
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
): GraphParseResult {
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

  const { edges, sinkIds } =
    variant === "steps"
      ? { edges: buildStepEdges(observations), sinkIds: null }
      : buildFlowEdges(observations, ancestry);

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

  // One observation per node — clicking a node selects exactly that call.
  const nodeToObservationsMap: Record<string, string[]> = {};
  for (const obs of observations) {
    nodeToObservationsMap[obs.id] = [obs.id];
  }

  return { graph: { nodes, edges }, nodeToObservationsMap };
}
