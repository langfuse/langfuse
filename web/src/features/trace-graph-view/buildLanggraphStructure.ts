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
  const stepToNodeMap = new Map<number, string>();
  const nodeToParentObservationMap = new Map<string, string>();

  agentGraphData.forEach((o) => {
    const { node, step } = o;

    if (step !== null && node !== null) {
      stepToNodeMap.set(step, node);
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
          stepToNodeMap.set(0, LANGGRAPH_START_NODE_NAME);
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

  const nodeNames = [
    ...new Set([...stepToNodeMap.values(), LANGGRAPH_END_NODE_NAME]),
  ];

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

  const edges = [...stepToNodeMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([_, node], idx, arr) => ({
      from: node,
      to: idx === arr.length - 1 ? LANGGRAPH_END_NODE_NAME : arr[idx + 1][1],
    }));

  return {
    graph: { nodes, edges },
    nodeToParentObservationMap: Object.fromEntries(
      nodeToParentObservationMap.entries(),
    ),
  };
}
