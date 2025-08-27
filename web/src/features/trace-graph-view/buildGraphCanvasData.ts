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
  nodeToParentObservationMap: Record<string, string>;
}

export function transformLanggraphToGeneralized(
  data: AgentGraphDataResponse[],
): AgentGraphDataResponse[] {
  // Filter out observations without proper node values for LangGraph
  const filteredData = data.filter(
    (obs) => obs.node && obs.node.trim().length > 0,
  );

  const transformedData = filteredData.map((obs) => {
    let transformedObs = {
      ...obs,
      // Use node value as name for generalized format
      name: obs.node || obs.name,
    };

    // Transform LangGraph system nodes to Langfuse system nodes
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
      nodeToParentObservationMap: {},
    };
  }

  const stepToNodesMap = new Map<number, Set<string>>();
  const nodeToParentObservationMap = new Map<string, string>();

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
      // initialize the end node to point to the top-most span
      if (!parent) {
        nodeToParentObservationMap.set(
          LANGFUSE_END_NODE_NAME,
          obs.parentObservationId,
        );

        // Also initialize the start node if it hasn't been seen yet
        // if (!nodeToParentObservationMap.has(LANGFUSE_START_NODE_NAME)) {
        //   if (!stepToNodesMap.has(0)) {
        //     stepToNodesMap.set(0, new Set());
        //   }
        //   stepToNodesMap.get(0)!.add(LANGFUSE_START_NODE_NAME);
        //   nodeToParentObservationMap.set(
        //     LANGFUSE_START_NODE_NAME,
        //     obs.parentObservationId,
        //   );
        // }
      }

      // Only register id if it is top-most to allow navigation on node click in graph
      if (obs.name !== parent?.name && node !== null) {
        nodeToParentObservationMap.set(node, obs.id);
      }
    } else if (node !== null) {
      nodeToParentObservationMap.set(node, obs.id);
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
    nodeToParentObservationMap: Object.fromEntries(
      nodeToParentObservationMap.entries(),
    ),
  };

  // Build edges with proper parallel branch handling
  // const edges = buildSequentialStepEdges(stepToNodesMap);
}

function generateEdgesWithParallelBranches(
  stepToNodesMap: Map<number, Set<string>>,
) {
  // Generate edges with proper parallel branch handling
  const sortedSteps = [...stepToNodesMap.entries()].sort(([a], [b]) => a - b);
  const edges: Array<{ from: string; to: string }> = [];

  sortedSteps.forEach(([, currentNodes], i) => {
    const isLastStep = i === sortedSteps.length - 1;
    const targetNodes = isLastStep
      ? [LANGFUSE_END_NODE_NAME]
      : Array.from(sortedSteps[i + 1][1]);

    // Connect all current nodes to all target nodes
    Array.from(currentNodes).forEach((currentNode) => {
      // Skip creating edges from end node (end nodes should be terminal)
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

function buildSequentialStepEdges(
  stepToNodesMap: Map<number, Set<string>>,
): Array<{ from: string; to: string }> {
  const sortedSteps = [...stepToNodesMap.entries()].sort(([a], [b]) => a - b);
  const edges: Array<{ from: string; to: string }> = [];

  for (let i = 0; i < sortedSteps.length; i++) {
    const [currentStep, currentNodes] = sortedSteps[i];
    const isLastStep = i === sortedSteps.length - 1;

    if (isLastStep) {
      // All nodes in final step connect to __end__ (but avoid __end__ -> __end__)
      Array.from(currentNodes).forEach((currentNode) => {
        if (currentNode !== LANGFUSE_END_NODE_NAME) {
          edges.push({ from: currentNode, to: LANGFUSE_END_NODE_NAME });
        }
      });
    } else {
      const [, nextNodes] = sortedSteps[i + 1];

      // Fan-out and fan-in logic
      Array.from(currentNodes).forEach((currentNode) => {
        Array.from(nextNodes).forEach((nextNode) => {
          edges.push({ from: currentNode, to: nextNode });
        });
      });
    }
  }

  console.log("DEBUG: Sequential step edges:", JSON.stringify(edges, null, 2));
  return edges;
}
