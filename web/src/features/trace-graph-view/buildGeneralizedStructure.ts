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
        type: obs.observationType,
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

  // Group observations by parent and calculate timestamps only for those with parents
  const obsByParent = new Map<
    string,
    Array<{ obs: AgentGraphDataResponse; start: number; end: number }>
  >();
  sortedObs.forEach((obs) => {
    if (obs.parentObservationId) {
      if (!obsByParent.has(obs.parentObservationId)) {
        obsByParent.set(obs.parentObservationId, []);
      }
      const start = new Date(obs.startTime).getTime();
      const end = obs.endTime ? new Date(obs.endTime).getTime() : start;
      obsByParent.get(obs.parentObservationId)!.push({ obs, start, end });
    }
  });

  const hasSequentialChild = new Set<string>(); // Nodes that have sequential children
  const hasSequentialParent = new Set<string>(); // Nodes that have sequential parents

  // find sequential edges for each parent
  obsByParent.forEach((siblings) => {
    for (let i = 0; i < siblings.length - 1; i++) {
      const current = siblings[i];
      const next = siblings[i + 1];

      // If current observation ended before next one started, create sequential edge
      if (current.end <= next.start) {
        const edge = { from: current.obs.name, to: next.obs.name };
        const edgeKey = `${edge.from}->${edge.to}`;

        if (!processedPairs.has(edgeKey)) {
          edges.push(edge);
          hasSequentialChild.add(current.obs.name);
          hasSequentialParent.add(next.obs.name);
          processedPairs.add(edgeKey);
        }
      }
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
