import {
  type GraphCanvasData,
  type GraphNodeData,
  type AgentGraphDataResponse,
  LANGGRAPH_START_NODE_NAME,
  LANGGRAPH_END_NODE_NAME,
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
} from "./types";
import {
  hasNestedLanggraphSubgraphs,
  qualifyLanggraphNodes,
} from "./langgraphSubgraphs";

export interface GraphParseResult {
  graph: GraphCanvasData;
  nodeToObservationsMap: Record<string, string[]>;
}

const SYSTEM_NODE_NAMES = new Set([
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
  LANGGRAPH_START_NODE_NAME,
  LANGGRAPH_END_NODE_NAME,
]);

function leafNodeName(node: string): string {
  const idx = node.lastIndexOf("/");
  return idx === -1 ? node : node.slice(idx + 1);
}

function isSystemLeaf(node: string): boolean {
  return SYSTEM_NODE_NAMES.has(leafNodeName(node));
}

export function transformLanggraphToGeneralized(
  data: AgentGraphDataResponse[],
): AgentGraphDataResponse[] {
  // can't draw nodes without `node` property set for LangGraph
  const filteredData = data.filter(
    (obs) => obs.node && obs.node.trim().length > 0,
  );

  // Path-qualify nested subgraph nodes so identical `langgraph_node` names in
  // different subgraphs stay distinct (issue #8078). Host wrappers are kept
  // here so per-scope edge stitching can rewire through them; they are omitted
  // from the final node list in buildGraphFromStepData once expanded.
  const withQualifiedNodes = hasNestedLanggraphSubgraphs(filteredData)
    ? qualifyLanggraphNodes(filteredData)
    : filteredData;

  const transformedData: AgentGraphDataResponse[] = [];

  for (const obs of withQualifiedNodes) {
    const node = obs.node;
    if (!node) continue;

    // Nested subgraphs also emit __start__/__end__; only keep root anchors.
    if (isSystemLeaf(node) && node.includes("/")) {
      continue;
    }

    let transformedObs: AgentGraphDataResponse = {
      ...obs,
      name: node,
    };

    if (
      node === LANGGRAPH_START_NODE_NAME ||
      node === LANGFUSE_START_NODE_NAME
    ) {
      transformedObs = {
        ...transformedObs,
        name: LANGFUSE_START_NODE_NAME,
        id: LANGFUSE_START_NODE_NAME,
        node: LANGFUSE_START_NODE_NAME,
      };
    } else if (
      node === LANGGRAPH_END_NODE_NAME ||
      node === LANGFUSE_END_NODE_NAME
    ) {
      transformedObs = {
        ...transformedObs,
        name: LANGFUSE_END_NODE_NAME,
        id: LANGFUSE_END_NODE_NAME,
        node: LANGFUSE_END_NODE_NAME,
      };
    }

    transformedData.push(transformedObs);
  }

  const hasStartNode = transformedData.some(
    (obs) => obs.node === LANGFUSE_START_NODE_NAME,
  );
  const hasEndNode = transformedData.some(
    (obs) => obs.node === LANGFUSE_END_NODE_NAME,
  );

  const systemNodes: AgentGraphDataResponse[] = [];

  if (!hasStartNode) {
    const topLevelObs = transformedData.find((obs) => !obs.parentObservationId);
    systemNodes.push({
      id: LANGFUSE_START_NODE_NAME,
      name: LANGFUSE_START_NODE_NAME,
      node: LANGFUSE_START_NODE_NAME,
      step: 0,
      parentObservationId: topLevelObs?.parentObservationId || null,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      observationType: "LANGGRAPH_SYSTEM",
    });
  }

  if (!hasEndNode) {
    const topLevelObs = transformedData.find((obs) => !obs.parentObservationId);
    const maxStep = Math.max(0, ...transformedData.map((obs) => obs.step || 0));
    systemNodes.push({
      id: LANGFUSE_END_NODE_NAME,
      name: LANGFUSE_END_NODE_NAME,
      node: LANGFUSE_END_NODE_NAME,
      step: maxStep + 1,
      parentObservationId: topLevelObs?.parentObservationId || null,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      observationType: "LANGGRAPH_SYSTEM",
    });
  }

  return [...transformedData, ...systemNodes];
}

/**
 * Build the aggregated graph. When observations carry path-qualified subgraph
 * node ids, edges are generated per graph scope (so subgraph step counters
 * don't collide with the parent) and stitched through host wrappers.
 */
export function buildGraphFromStepData(
  data: AgentGraphDataResponse[],
): GraphParseResult {
  if (data.length === 0) {
    return {
      graph: { nodes: [], edges: [] },
      nodeToObservationsMap: {},
    };
  }

  const hasSubgraphs = data.some(
    (obs) => typeof obs.node === "string" && obs.node.includes("/"),
  );

  if (hasSubgraphs) {
    return buildGraphWithSubgraphScopes(data);
  }

  return buildFlatStepGraph(data);
}

function buildFlatStepGraph(data: AgentGraphDataResponse[]): GraphParseResult {
  const stepToNodesMap = new Map<number, Set<string>>();
  const nodeToObservationsMap = new Map<string, string[]>();

  data.forEach((obs) => {
    const { node, step } = obs;

    if (step !== null && node !== null) {
      if (!stepToNodesMap.has(step)) {
        stepToNodesMap.set(step, new Set());
      }
      stepToNodesMap.get(step)!.add(node);
    }

    registerObservationForNode(obs, data, nodeToObservationsMap);
  });

  return finalizeFlatGraph(data, stepToNodesMap, nodeToObservationsMap);
}

/**
 * Per-scope step maps + host stitching for nested LangGraph subgraphs.
 *
 * Parent and subgraph each restart `langgraph_step` at 1. Mixing them into one
 * global step map incorrectly places nested nodes beside parent siblings.
 * Instead we:
 * 1. Build edges within each checkpoint scope from local steps
 * 2. Treat each subgraph host (path prefix) as a virtual node: incoming parent
 *    edges fan into nested sources, nested sinks fan out to the parent's next
 * 3. Omit expanded hosts from the final node list
 */
function buildGraphWithSubgraphScopes(
  data: AgentGraphDataResponse[],
): GraphParseResult {
  const nodeToObservationsMap = new Map<string, string[]>();
  const scopes = new Map<
    string,
    { stepToNodes: Map<number, Set<string>>; nodes: Set<string> }
  >();

  for (const obs of data) {
    registerObservationForNode(obs, data, nodeToObservationsMap);

    if (obs.step === null || obs.node === null) continue;

    if (SYSTEM_NODE_NAMES.has(obs.node)) {
      const root = getOrCreateScope(scopes, "");
      if (!root.stepToNodes.has(obs.step)) {
        root.stepToNodes.set(obs.step, new Set());
      }
      root.stepToNodes.get(obs.step)!.add(obs.node);
      root.nodes.add(obs.node);
      continue;
    }

    const scope = parentScopeOfQualifiedNode(obs.node);
    const bucket = getOrCreateScope(scopes, scope);
    if (!bucket.stepToNodes.has(obs.step)) {
      bucket.stepToNodes.set(obs.step, new Set());
    }
    bucket.stepToNodes.get(obs.step)!.add(obs.node);
    bucket.nodes.add(obs.node);
  }

  const scopeEdges = new Map<string, Array<{ from: string; to: string }>>();
  for (const [scope, { stepToNodes }] of scopes) {
    scopeEdges.set(scope, generateEdgesBetweenSteps(stepToNodes));
  }

  // Virtual host → { sources, sinks } after expanding nested graphs
  const hostExpansion = new Map<
    string,
    { sources: Set<string>; sinks: Set<string> }
  >();

  // Deepest scopes first so multi-level nesting resolves bottom-up.
  const scopesByDepth = [...scopes.keys()].sort(
    (a, b) =>
      b.split("/").filter(Boolean).length - a.split("/").filter(Boolean).length,
  );

  const edges: Array<{ from: string; to: string }> = [];

  for (const scope of scopesByDepth) {
    if (scope === "") continue;

    const localEdges = scopeEdges.get(scope) ?? [];
    const localNodes = scopes.get(scope)?.nodes ?? new Set<string>();
    const hasIncoming = new Set(localEdges.map((e) => e.to));
    const hasOutgoing = new Set(localEdges.map((e) => e.from));

    let sources = [...localNodes].filter(
      (n) => !hasIncoming.has(n) && !isSystemLeaf(n),
    );
    let sinks = [...localNodes].filter(
      (n) => !hasOutgoing.has(n) && !isSystemLeaf(n),
    );

    sources = sources.flatMap((n) =>
      hostExpansion.has(n) ? [...hostExpansion.get(n)!.sources] : [n],
    );
    sinks = sinks.flatMap((n) =>
      hostExpansion.has(n) ? [...hostExpansion.get(n)!.sinks] : [n],
    );

    for (const edge of localEdges) {
      const froms = hostExpansion.has(edge.from)
        ? [...hostExpansion.get(edge.from)!.sinks]
        : [edge.from];
      const tos = hostExpansion.has(edge.to)
        ? [...hostExpansion.get(edge.to)!.sources]
        : [edge.to];
      for (const from of froms) {
        for (const to of tos) {
          edges.push({ from, to });
        }
      }
    }

    hostExpansion.set(scope, {
      sources: new Set(sources),
      sinks: new Set(sinks),
    });
  }

  const allNodeIds = new Set(
    data.map((obs) => obs.node).filter((n): n is string => Boolean(n)),
  );

  const rootEdges = scopeEdges.get("") ?? [];
  for (const edge of rootEdges) {
    const froms = hostExpansion.has(edge.from)
      ? [...hostExpansion.get(edge.from)!.sinks]
      : [edge.from];
    const tos = hostExpansion.has(edge.to)
      ? [...hostExpansion.get(edge.to)!.sources]
      : [edge.to];
    for (const from of froms) {
      for (const to of tos) {
        edges.push({ from, to });
      }
    }
  }

  // Final nodes: everything except expanded hosts (internals replace them).
  const expandedHosts = new Set(hostExpansion.keys());
  const finalNodeIds = [...allNodeIds].filter((n) => !expandedHosts.has(n));

  const edgeKeys = new Set<string>();
  const dedupedEdges: Array<{ from: string; to: string }> = [];
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    if (!finalNodeIds.includes(edge.from) || !finalNodeIds.includes(edge.to)) {
      continue;
    }
    const key = `${edge.from}->${edge.to}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    dedupedEdges.push(edge);
  }

  // Wire orphans to system anchors.
  if (finalNodeIds.includes(LANGFUSE_START_NODE_NAME)) {
    const hasIncoming = new Set(dedupedEdges.map((e) => e.to));
    for (const node of finalNodeIds) {
      if (SYSTEM_NODE_NAMES.has(node)) continue;
      if (!hasIncoming.has(node)) {
        const key = `${LANGFUSE_START_NODE_NAME}->${node}`;
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          dedupedEdges.push({ from: LANGFUSE_START_NODE_NAME, to: node });
        }
      }
    }
  }
  if (finalNodeIds.includes(LANGFUSE_END_NODE_NAME)) {
    const hasOutgoing = new Set(dedupedEdges.map((e) => e.from));
    for (const node of finalNodeIds) {
      if (SYSTEM_NODE_NAMES.has(node)) continue;
      if (!hasOutgoing.has(node)) {
        const key = `${node}->${LANGFUSE_END_NODE_NAME}`;
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          dedupedEdges.push({ from: node, to: LANGFUSE_END_NODE_NAME });
        }
      }
    }
  }

  // Don't register click targets for omitted host wrappers.
  for (const host of expandedHosts) {
    nodeToObservationsMap.delete(host);
  }

  const nodes: GraphNodeData[] = finalNodeIds.map((nodeName) => {
    if (
      nodeName === LANGFUSE_END_NODE_NAME ||
      nodeName === LANGFUSE_START_NODE_NAME
    ) {
      return {
        id: nodeName,
        label: nodeName,
        type: "LANGGRAPH_SYSTEM",
      };
    }
    const obs = data.find((o) => o.node === nodeName);
    return {
      id: nodeName,
      label: leafNodeName(nodeName),
      type: obs?.observationType || "UNKNOWN",
    };
  });

  return {
    graph: { nodes, edges: dedupedEdges },
    nodeToObservationsMap: Object.fromEntries(nodeToObservationsMap.entries()),
  };
}

function parentScopeOfQualifiedNode(node: string): string {
  const idx = node.lastIndexOf("/");
  if (idx === -1) return "";
  return node.slice(0, idx);
}

function getOrCreateScope(
  scopes: Map<
    string,
    { stepToNodes: Map<number, Set<string>>; nodes: Set<string> }
  >,
  scope: string,
) {
  let bucket = scopes.get(scope);
  if (!bucket) {
    bucket = { stepToNodes: new Map(), nodes: new Set() };
    scopes.set(scope, bucket);
  }
  return bucket;
}

function registerObservationForNode(
  obs: AgentGraphDataResponse,
  data: AgentGraphDataResponse[],
  nodeToObservationsMap: Map<string, string[]>,
) {
  const { node } = obs;

  if (obs.parentObservationId) {
    const parent = data.find((o) => o.id === obs.parentObservationId);
    if (!parent && node === null) {
      if (!nodeToObservationsMap.has(LANGFUSE_END_NODE_NAME)) {
        nodeToObservationsMap.set(LANGFUSE_END_NODE_NAME, []);
      }
      nodeToObservationsMap.get(LANGFUSE_END_NODE_NAME)!.push(obs.id);
    }

    if (obs.name !== parent?.name && node !== null) {
      if (!nodeToObservationsMap.has(node)) {
        nodeToObservationsMap.set(node, []);
      }
      nodeToObservationsMap.get(node)!.push(obs.id);
    }
  } else if (node !== null) {
    if (!SYSTEM_NODE_NAMES.has(node)) {
      if (!nodeToObservationsMap.has(node)) {
        nodeToObservationsMap.set(node, []);
      }
      nodeToObservationsMap.get(node)!.push(obs.id);
    }
  }
}

function finalizeFlatGraph(
  data: AgentGraphDataResponse[],
  stepToNodesMap: Map<number, Set<string>>,
  nodeToObservationsMap: Map<string, string[]>,
): GraphParseResult {
  const allStepNodes = Array.from(stepToNodesMap.values()).flatMap((set) =>
    Array.from(set),
  );
  const nodeNames = [...new Set([...allStepNodes, LANGFUSE_END_NODE_NAME])];

  const nodes: GraphNodeData[] = nodeNames.map((nodeName) => {
    if (
      nodeName === LANGFUSE_END_NODE_NAME ||
      nodeName === LANGFUSE_START_NODE_NAME
    ) {
      return {
        id: nodeName,
        label: nodeName,
        type: "LANGGRAPH_SYSTEM",
      };
    }
    const obs = data.find((o) => o.node === nodeName);
    return {
      id: nodeName,
      label: nodeName,
      type: obs?.observationType || "UNKNOWN",
    };
  });

  const edges = generateEdgesWithParallelBranches(stepToNodesMap);

  return {
    graph: { nodes, edges },
    nodeToObservationsMap: Object.fromEntries(nodeToObservationsMap.entries()),
  };
}

/** Edges between consecutive steps only (no terminal __end__ injection). */
function generateEdgesBetweenSteps(stepToNodesMap: Map<number, Set<string>>) {
  const sortedSteps = [...stepToNodesMap.entries()].sort(([a], [b]) => a - b);
  const edges: Array<{ from: string; to: string }> = [];

  for (let i = 0; i < sortedSteps.length - 1; i++) {
    const currentNodes = Array.from(sortedSteps[i][1]);
    const targetNodes = Array.from(sortedSteps[i + 1][1]);

    for (const currentNode of currentNodes) {
      if (
        currentNode === LANGFUSE_END_NODE_NAME ||
        currentNode === LANGGRAPH_END_NODE_NAME
      ) {
        continue;
      }
      for (const targetNode of targetNodes) {
        edges.push({ from: currentNode, to: targetNode });
      }
    }
  }

  return edges;
}

function generateEdgesWithParallelBranches(
  stepToNodesMap: Map<number, Set<string>>,
) {
  const sortedSteps = [...stepToNodesMap.entries()].sort(([a], [b]) => a - b);
  const edges: Array<{ from: string; to: string }> = [];

  sortedSteps.forEach(([, currentNodes], i) => {
    const isLastStep = i === sortedSteps.length - 1;
    const targetNodes = isLastStep
      ? [LANGFUSE_END_NODE_NAME]
      : Array.from(sortedSteps[i + 1][1]);

    Array.from(currentNodes).forEach((currentNode) => {
      if (
        currentNode === LANGFUSE_END_NODE_NAME ||
        currentNode === LANGGRAPH_END_NODE_NAME
      ) {
        return;
      }

      targetNodes.forEach((targetNode) => {
        edges.push({ from: currentNode, to: targetNode });
      });
    });
  });

  return edges;
}
