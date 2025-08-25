import { ObservationType } from "@langfuse/shared";
import {
  type GraphCanvasData,
  type GraphNodeData,
  type AgentGraphDataResponse,
} from "./types";

export interface GraphParseResult {
  graph: GraphCanvasData;
  nodeToParentObservationMap: Record<string, string>;
}

export function buildGeneralizedStructure(
  agentGraphData: AgentGraphDataResponse[],
): GraphParseResult {
  const filteredData = filterValidObservations(agentGraphData);

  console.log("Original data count:", agentGraphData.length);
  console.log("Filtered data count:", filteredData.length);
  console.log(
    "Filtered out types:",
    agentGraphData
      .filter(
        (item) =>
          item.observationType === ObservationType.SPAN ||
          item.observationType === ObservationType.EVENT,
      )
      .map((item) => ({
        id: item.id,
        observationType: item.observationType,
        node: item.node,
      })),
  );

  return parseGenericAgentData(filteredData);
}

function filterValidObservations(
  data: AgentGraphDataResponse[],
): AgentGraphDataResponse[] {
  return data.filter(
    (item) =>
      item.observationType !== ObservationType.SPAN &&
      item.observationType !== ObservationType.EVENT,
  );
}

function parseGenericAgentData(
  data: AgentGraphDataResponse[],
): GraphParseResult {
  const obsById = buildObservationMap(data);
  const { nodeToFirstOccurrence, nodeToParentObservationMap } =
    buildNodeMappings(data);

  const nodes = createGenericNodes(nodeToFirstOccurrence);
  const edges = buildHierarchicalEdges(data, obsById);

  console.log("DEBUG: All nodes with types:", JSON.stringify(nodes));
  console.log("DEBUG: Generated edges:", JSON.stringify(edges));

  return {
    graph: { nodes, edges },
    nodeToParentObservationMap: Object.fromEntries(
      nodeToParentObservationMap.entries(),
    ),
  };
}

function buildObservationMap(
  data: AgentGraphDataResponse[],
): Map<string, AgentGraphDataResponse> {
  const obsById = new Map<string, AgentGraphDataResponse>();
  data.forEach((obs) => {
    obsById.set(obs.id, obs);
  });
  return obsById;
}

function buildNodeMappings(data: AgentGraphDataResponse[]): {
  nodeToFirstOccurrence: Map<string, AgentGraphDataResponse>;
  nodeToParentObservationMap: Map<string, string>;
} {
  const nodeToFirstOccurrence = new Map<string, AgentGraphDataResponse>();
  const nodeToParentObservationMap = new Map<string, string>();

  data.forEach((obs) => {
    const nodeName = obs.name;

    // Track first occurrence
    if (!nodeToFirstOccurrence.has(nodeName)) {
      nodeToFirstOccurrence.set(nodeName, obs);
      nodeToParentObservationMap.set(nodeName, obs.id);
    }
  });

  return { nodeToFirstOccurrence, nodeToParentObservationMap };
}

function createGenericNodes(
  nodeToFirstOccurrence: Map<string, AgentGraphDataResponse>,
): GraphNodeData[] {
  return Array.from(nodeToFirstOccurrence.entries()).map(([nodeName, obs]) => ({
    id: nodeName,
    label: nodeName,
    type: obs.type,
  }));
}

function buildHierarchicalEdges(
  data: AgentGraphDataResponse[],
  obsById: Map<string, AgentGraphDataResponse>,
): Array<{ from: string; to: string }> {
  const edges: Array<{ from: string; to: string }> = [];
  const processedPairs = new Set<string>(); // Avoid duplicate edges

  // Sort observations by start time for temporal analysis
  const sortedObs = [...data].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  // First, identify all sequential timing edges that can be created
  const sequentialEdges = new Set<string>();
  const hasSequentialChild = new Set<string>(); // Nodes that have sequential children
  const hasSequentialParent = new Set<string>(); // Nodes that have sequential parents

  sortedObs.forEach((obs, index) => {
    const obsEnd = obs.endTime
      ? new Date(obs.endTime).getTime()
      : new Date(obs.startTime).getTime();

    // Look for sequential timing edges
    for (let i = index + 1; i < sortedObs.length; i++) {
      const nextObs = sortedObs[i];
      const nextStart = new Date(nextObs.startTime).getTime();

      // If current observation ended before next one started
      // AND they have the same parent (siblings), create sequential edge
      if (
        obsEnd <= nextStart &&
        obs.parentObservationId === nextObs.parentObservationId &&
        obs.parentObservationId !== null
      ) {
        const edgeKey = `${obs.name}->${nextObs.name}`;
        sequentialEdges.add(edgeKey);
        hasSequentialChild.add(obs.name);
        hasSequentialParent.add(nextObs.name);
        break; // Only connect to immediate next sibling
      }
    }
  });

  // Add sequential edges first
  sequentialEdges.forEach((edgeKey) => {
    const [from, to] = edgeKey.split("->");
    if (!processedPairs.has(edgeKey)) {
      edges.push({ from, to });
      processedPairs.add(edgeKey);
    }
  });

  // Add hierarchical edges only for nodes that don't have sequential relationships
  sortedObs.forEach((obs) => {
    if (obs.parentObservationId) {
      const parent = obsById.get(obs.parentObservationId);
      if (parent) {
        // Only add hierarchical edge if:
        // 1. Child doesn't have a sequential parent (not part of a timing chain)
        // OR child is not a sibling of nodes in the timing chain (different hierarchy level)
        const isChildPartOfSequentialChain = hasSequentialParent.has(obs.name);
        const isParentPartOfSequentialChain = hasSequentialChild.has(
          parent.name,
        );

        // Always connect if child is not part of sequential chain, OR
        // if parent is part of sequential chain (tools can have hierarchical children like generations)
        if (!isChildPartOfSequentialChain || isParentPartOfSequentialChain) {
          const edgeKey = `${parent.name}->${obs.name}`;
          if (!processedPairs.has(edgeKey)) {
            edges.push({ from: parent.name, to: obs.name });
            processedPairs.add(edgeKey);
          }
        }
      }
    }
  });

  console.log(
    "DEBUG: Timing analysis - sorted observations:",
    JSON.stringify(
      sortedObs.map((obs) => ({
        name: obs.name,
        startTime: obs.startTime,
        endTime: obs.endTime,
        parentId: obs.parentObservationId,
      })),
    ),
  );

  return edges;
}
