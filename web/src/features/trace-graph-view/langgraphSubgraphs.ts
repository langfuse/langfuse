import {
  type AgentGraphDataResponse,
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
  LANGGRAPH_START_NODE_NAME,
  LANGGRAPH_END_NODE_NAME,
} from "./types";

const SYSTEM_NODE_NAMES = new Set([
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
  LANGGRAPH_START_NODE_NAME,
  LANGGRAPH_END_NODE_NAME,
]);

/**
 * Parse `langgraph_checkpoint_ns` into path segments with UUIDs stripped.
 *
 * Examples:
 * - "" → []
 * - "planner:abc-uuid" → ["planner"]
 * - "research_team:abc|search:def" → ["research_team", "search"]
 */
export function parseLanggraphCheckpointPath(
  checkpointNs: string | null | undefined,
): string[] {
  if (!checkpointNs || !checkpointNs.trim()) return [];
  return checkpointNs
    .split("|")
    .map((segment) => segment.split(":")[0]?.trim())
    .filter((segment): segment is string => Boolean(segment));
}

/**
 * Graph scope = parent path (everything except the leaf node).
 * Root-level nodes have an empty scope.
 */
export function graphScopeFromPath(path: string[]): string {
  if (path.length <= 1) return "";
  return path.slice(0, -1).join("/");
}

export function pathKey(path: string[]): string {
  return path.join("/");
}

/**
 * True when any observation is nested inside a subgraph
 * (`langgraph_checkpoint_ns` contains a `|` separator).
 */
export function hasNestedLanggraphSubgraphs(
  data: AgentGraphDataResponse[],
): boolean {
  return data.some(
    (obs) =>
      typeof obs.checkpointNs === "string" && obs.checkpointNs.includes("|"),
  );
}

export type QualifiedLanggraphObs = AgentGraphDataResponse & {
  /** Path segments from checkpoint_ns (UUIDs stripped). */
  path: string[];
  /** Parent-path scope used to group per-graph step edges. */
  scope: string;
};

/**
 * Qualify LangGraph node ids with their checkpoint path so nodes inside
 * different subgraphs stay distinct even when they share `langgraph_node`
 * names (e.g. two agents both named "agent").
 *
 * System start/end nodes are left unchanged.
 */
export function qualifyLanggraphNodes(
  data: AgentGraphDataResponse[],
): QualifiedLanggraphObs[] {
  return data.map((obs) => {
    if (!obs.node || SYSTEM_NODE_NAMES.has(obs.node)) {
      return {
        ...obs,
        path: obs.node ? [obs.node] : [],
        scope: "",
      };
    }

    const path = parseLanggraphCheckpointPath(obs.checkpointNs);
    // Prefer the checkpoint path when present; fall back to the bare node name.
    // Paths from LangGraph usually end with the current `langgraph_node`.
    const effectivePath =
      path.length > 0
        ? path[path.length - 1] === obs.node
          ? path
          : [...path, obs.node]
        : [obs.node];

    const qualifiedId = pathKey(effectivePath);
    return {
      ...obs,
      node: qualifiedId,
      // Keep leaf name as the observation name for display fallbacks.
      name: obs.node,
      path: effectivePath,
      scope: graphScopeFromPath(effectivePath),
    };
  });
}

/**
 * Subgraph host nodes are parent-path prefixes of other nodes
 * (e.g. "research_team" when "research_team/search" exists). Once internals
 * are shown, the host wrapper is redundant in the aggregated diagram.
 */
export function findSubgraphHostIds(
  qualified: QualifiedLanggraphObs[],
): Set<string> {
  const nodeIds = new Set(
    qualified.map((obs) => obs.node).filter((n): n is string => Boolean(n)),
  );
  const hosts = new Set<string>();
  for (const id of nodeIds) {
    const prefix = `${id}/`;
    for (const other of nodeIds) {
      if (other.startsWith(prefix)) {
        hosts.add(id);
        break;
      }
    }
  }
  return hosts;
}
