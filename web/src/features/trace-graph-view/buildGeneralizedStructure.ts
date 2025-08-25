import { ObservationType } from "@langfuse/shared";
import {
  type GraphCanvasData,
  type GraphNodeData,
  type AgentGraphDataResponse,
} from "./types";

const MAX_NODE_NUMBER_FOR_PERFORMANCE = 250;

export interface GraphParseResult {
  graph: GraphCanvasData;
  nodeToParentObservationMap: Record<string, string>;
}

export function buildGeneralizedStructure(
  agentGraphData: AgentGraphDataResponse[],
): GraphParseResult {
  if (agentGraphData.length >= MAX_NODE_NUMBER_FOR_PERFORMANCE) {
    return {
      graph: { nodes: [], edges: [] },
      nodeToParentObservationMap: {},
    };
  }

  // for now, we don't want to show SPAN/EVENTs but rather beneath lying actual nodes
  const filteredData = agentGraphData.filter(
    (item) =>
      item.observationType !== ObservationType.SPAN &&
      item.observationType !== ObservationType.EVENT,
  );

  const { nodes, nodeToParentObservationMap } =
    buildNodesAndMappings(filteredData);
  const edges = buildHierarchicalEdges(filteredData);

  return {
    graph: { nodes, edges },
    nodeToParentObservationMap,
  };
}

function buildNodesAndMappings(data: AgentGraphDataResponse[]): {
  nodes: GraphNodeData[];
  nodeToParentObservationMap: Record<string, string>;
} {
  const nodes: GraphNodeData[] = [];
  const nodeToParentObservationMap: Record<string, string> = {};
  const seenNodes = new Set<string>();

  data.forEach((obs) => {
    const nodeName = obs.name;

    if (!seenNodes.has(nodeName)) {
      seenNodes.add(nodeName);
      nodes.push({
        id: nodeName,
        label: nodeName,
        type: obs.type,
      });
      // TODO: should have a list of all ids, so that multiple clicks on a node cycles through IDs
      nodeToParentObservationMap[nodeName] = obs.id;
    }
  });

  return { nodes, nodeToParentObservationMap };
}

function buildHierarchicalEdges(
  data: AgentGraphDataResponse[],
): Array<{ from: string; to: string }> {
  const edges: Array<{ from: string; to: string }> = [];
  const processedPairs = new Set<string>();

  const sortedObs = [...data].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  const obsTimestamps = new Map(
    sortedObs.map((obs) => [
      obs.id,
      {
        start: new Date(obs.startTime).getTime(),
        end: obs.endTime
          ? new Date(obs.endTime).getTime()
          : new Date(obs.startTime).getTime(),
      },
    ]),
  );

  // First, identify all sequential timing edges that can be created
  const sequentialEdges = new Set<string>();
  const hasSequentialChild = new Set<string>(); // Nodes that have sequential children
  const hasSequentialParent = new Set<string>(); // Nodes that have sequential parents

  sortedObs.forEach((obs, index) => {
    const obsEnd = obsTimestamps.get(obs.id)!.end;

    // Look for sequential timing edges
    for (let i = index + 1; i < sortedObs.length; i++) {
      const nextObs = sortedObs[i];
      const nextStart = obsTimestamps.get(nextObs.id)!.start;

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
    if (from && to && !processedPairs.has(edgeKey)) {
      edges.push({ from, to });
      processedPairs.add(edgeKey);
    }
  });

  // Add hierarchical edges only for nodes that don't have sequential relationships
  sortedObs.forEach((obs) => {
    if (obs.parentObservationId) {
      const parent = data.find((o) => o.id === obs.parentObservationId);
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

  return edges;
}
