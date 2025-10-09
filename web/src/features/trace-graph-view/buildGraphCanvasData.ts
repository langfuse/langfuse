import {
  type GraphCanvasData,
  type GraphNodeData,
  type AgentGraphDataResponse,
  LANGGRAPH_START_NODE_NAME,
  LANGGRAPH_END_NODE_NAME,
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
} from "./types";

export interface GraphParseResult {
  graph: GraphCanvasData;
  nodeToObservationsMap: Record<string, string[]>;
}

export function transformLanggraphToGeneralized(
  data: AgentGraphDataResponse[],
): AgentGraphDataResponse[] {
  // can't draw nodes without `node` property set for LangGraph
  const filteredData = data.filter(
    (obs) => obs.node && obs.node.trim().length > 0,
  );

  const transformedData = filteredData.map((obs) => {
    let transformedObs = {
      ...obs,
      // fallback to node name if node empty (shouldn't happen!)
      name: obs.node || obs.name,
    };

    // Transform system nodes to Langfuse system nodes
    if (obs.node === LANGGRAPH_START_NODE_NAME) {
      transformedObs.name = LANGFUSE_START_NODE_NAME;
      transformedObs.id = LANGFUSE_START_NODE_NAME;
    } else if (obs.node === LANGGRAPH_END_NODE_NAME) {
      transformedObs.name = LANGFUSE_END_NODE_NAME;
      transformedObs.id = LANGFUSE_END_NODE_NAME;
    }

    return transformedObs;
  });

  // Add Langfuse system nodes if they don't exist
  const hasStartNode = transformedData.some(
    (obs) => obs.name === LANGFUSE_START_NODE_NAME,
  );
  const hasEndNode = transformedData.some(
    (obs) => obs.name === LANGFUSE_END_NODE_NAME,
  );

  const systemNodes: AgentGraphDataResponse[] = [];

  if (!hasStartNode) {
    // Find the top-level parent for system node mapping
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
    const maxStep = Math.max(...transformedData.map((obs) => obs.step || 0));
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

export function buildGraphFromStepData(
  data: AgentGraphDataResponse[],
): GraphParseResult {
  if (data.length === 0) {
    return {
      graph: { nodes: [], edges: [] },
      nodeToObservationsMap: {},
    };
  }

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

    if (obs.parentObservationId) {
      const parent = data.find((o) => o.id === obs.parentObservationId);
      // initialize the end node to point to the top-most span (only if no node field)
      if (!parent && node === null) {
        if (!nodeToObservationsMap.has(LANGFUSE_END_NODE_NAME)) {
          nodeToObservationsMap.set(LANGFUSE_END_NODE_NAME, []);
        }
        nodeToObservationsMap.get(LANGFUSE_END_NODE_NAME)!.push(obs.id);
      }

      // Only register id if it is top-most to allow navigation on node click in graph
      if (obs.name !== parent?.name && node !== null) {
        if (!nodeToObservationsMap.has(node)) {
          nodeToObservationsMap.set(node, []);
        }
        nodeToObservationsMap.get(node)!.push(obs.id);
      }
    } else if (node !== null) {
      const isSystemNode =
        node === LANGFUSE_START_NODE_NAME ||
        node === LANGFUSE_END_NODE_NAME ||
        node === LANGGRAPH_START_NODE_NAME ||
        node === LANGGRAPH_END_NODE_NAME;

      if (!isSystemNode) {
        if (!nodeToObservationsMap.has(node)) {
          nodeToObservationsMap.set(node, []);
        }
        nodeToObservationsMap.get(node)!.push(obs.id);
      }
    }
  });

  // Build nodes from step mapping
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

function generateEdgesWithParallelBranches(
  stepToNodesMap: Map<number, Set<string>>,
) {
  // generate edges with proper parallel branch handling
  const sortedSteps = [...stepToNodesMap.entries()].sort(([a], [b]) => a - b);
  const edges: Array<{ from: string; to: string }> = [];

  sortedSteps.forEach(([, currentNodes], i) => {
    const isLastStep = i === sortedSteps.length - 1;
    const targetNodes = isLastStep
      ? [LANGFUSE_END_NODE_NAME]
      : Array.from(sortedSteps[i + 1][1]);

    // connect all current nodes to all target nodes
    Array.from(currentNodes).forEach((currentNode) => {
      // end nodes should be terminal -> don't draw edges from them
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
