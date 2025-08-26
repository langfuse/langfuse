import {
  type GraphCanvasData,
  type GraphNodeData,
  type AgentGraphDataResponse,
  LANGGRAPH_END_NODE_NAME,
  LANGGRAPH_START_NODE_NAME,
} from "./types";

export interface GraphParseResult {
  graph: GraphCanvasData;
  nodeToParentObservationMap: Record<string, string>;
}

export function buildLanggraphStructure(
  agentGraphData: AgentGraphDataResponse[],
): GraphParseResult {
  const stepToNodesMap = new Map<number, Set<string>>();
  const nodeToParentObservationMap = new Map<string, string>();

  agentGraphData.forEach((o) => {
    const { node, step } = o;

    if (step !== null && node !== null) {
      if (!stepToNodesMap.has(step)) {
        stepToNodesMap.set(step, new Set());
      }
      stepToNodesMap.get(step)!.add(node);
    }

    if (o.parentObservationId) {
      const parent = agentGraphData.find(
        (obs) => obs.id === o.parentObservationId,
      );

      // initialize the end node to point to the top-most langgraph span
      if (!parent) {
        nodeToParentObservationMap.set(
          LANGGRAPH_END_NODE_NAME,
          o.parentObservationId,
        );

        // Also initialize the start node if it hasn't been seen yet
        // Langgraph >= v4 is no longer adding a span for the start node
        if (!nodeToParentObservationMap.has(LANGGRAPH_START_NODE_NAME)) {
          if (!stepToNodesMap.has(0)) {
            stepToNodesMap.set(0, new Set());
          }
          stepToNodesMap.get(0)!.add(LANGGRAPH_START_NODE_NAME);
          nodeToParentObservationMap.set(
            LANGGRAPH_START_NODE_NAME,
            o.parentObservationId,
          );
        }
      }

      // Only register id if it is top-most to allow navigation on node click in graph
      if (o.node !== parent?.node && node !== null) {
        nodeToParentObservationMap.set(node, o.id);
      }
    } else if (node !== null) {
      nodeToParentObservationMap.set(node, o.id);
    }
  });

  const allStepNodes = [...stepToNodesMap.values()].flatMap((set) => [...set]);
  const nodeNames = [...new Set([...allStepNodes, LANGGRAPH_END_NODE_NAME])];

  const nodes: GraphNodeData[] = nodeNames.map((nodeName) => {
    if (
      nodeName === LANGGRAPH_END_NODE_NAME ||
      nodeName === LANGGRAPH_START_NODE_NAME
    ) {
      return {
        id: nodeName,
        label: nodeName,
        type: "LANGGRAPH_SYSTEM",
      };
    }

    const obs = agentGraphData.find((o) => o.node === nodeName);
    return {
      id: nodeName,
      label: nodeName,
      type: obs?.observationType || "UNKNOWN",
    };
  });

  // Generate edges with proper parallel branch handling
  const sortedSteps = [...stepToNodesMap.entries()].sort(([a], [b]) => a - b);
  const edges: Array<{ from: string; to: string }> = [];

  sortedSteps.forEach(([, currentNodes], i) => {
    const isLastStep = i === sortedSteps.length - 1;
    const targetNodes = isLastStep
      ? [LANGGRAPH_END_NODE_NAME]
      : [...sortedSteps[i + 1][1]];

    // Connect all current nodes to all target nodes
    [...currentNodes].forEach((currentNode) => {
      targetNodes.forEach((targetNode) => {
        edges.push({ from: currentNode, to: targetNode });
      });
    });
  });

  return {
    graph: { nodes, edges },
    nodeToParentObservationMap: Object.fromEntries(
      nodeToParentObservationMap.entries(),
    ),
  };
}
