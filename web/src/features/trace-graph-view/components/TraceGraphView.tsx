import React, { useEffect, useState, useMemo, useCallback } from "react";
import { StringParam, useQueryParam } from "use-query-params";

import { TraceGraphCanvas } from "./TraceGraphCanvas";
import {
  type GraphCanvasData,
  LANGGRAPH_END_NODE_NAME,
  type AgentGraphDataResponse,
  LANGGRAPH_START_NODE_NAME,
} from "../types";

type TraceGraphViewProps = {
  agentGraphData: AgentGraphDataResponse[];
};

export const TraceGraphView: React.FC<TraceGraphViewProps> = (props) => {
  const { agentGraphData } = props;

  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null);
  const { graph, nodeToParentObservationMap } = useMemo(
    () => parseGraph({ agentGraphData }),
    [agentGraphData],
  );

  const [currentObservationId, setCurrentObservationId] = useQueryParam(
    "observation",
    StringParam,
  );

  useEffect(() => {
    const nodeName = agentGraphData.find(
      (o) => o.id === currentObservationId,
    )?.node;

    // Only set selectedNodeName if the node actually exists in the graph
    if (nodeName && graph.nodes.includes(nodeName)) {
      setSelectedNodeName(nodeName);
    } else {
      setSelectedNodeName(null);
    }
  }, [currentObservationId, agentGraphData, graph.nodes]);

  const onCanvasNodeNameChange = useCallback(
    (nodeName: string | null) => {
      setSelectedNodeName(nodeName);

      if (nodeName) {
        const nodeParentObservationId = nodeToParentObservationMap[nodeName];

        if (nodeParentObservationId)
          setCurrentObservationId(nodeParentObservationId);
      }
    },
    [nodeToParentObservationMap, setCurrentObservationId],
  );

  return (
    <div className="grid h-full w-full gap-4">
      <TraceGraphCanvas
        graph={graph}
        selectedNodeName={selectedNodeName}
        onCanvasNodeNameChange={onCanvasNodeNameChange}
      />
    </div>
  );
};

function parseGraph(params: { agentGraphData: AgentGraphDataResponse[] }): {
  graph: GraphCanvasData;
  nodeToParentObservationMap: Record<string, string>;
} {
  const { agentGraphData } = params;

  // Check if this is LangGraph data (has step metadata)
  const hasLangGraphData = agentGraphData.some(
    (o) => o.step != null && o.step !== 0,
  );

  if (hasLangGraphData) {
    return parseLangGraphData(agentGraphData);
  } else {
    return parseGenericAgentData(agentGraphData);
  }
}

function parseLangGraphData(agentGraphData: AgentGraphDataResponse[]): {
  graph: GraphCanvasData;
  nodeToParentObservationMap: Record<string, string>;
} {
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
      if (node !== null && o.node !== parent?.node) {
        nodeToParentObservationMap.set(node, o.id);
      }
    } else {
      if (node !== null) {
        nodeToParentObservationMap.set(node, o.id);
      }
    }
  });

  const nodeNames = [
    ...new Set([...stepToNodeMap.values(), LANGGRAPH_END_NODE_NAME]),
  ];

  const nodes = nodeNames.map((nodeName) => {
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
      type: obs?.type || "UNKNOWN",
    };
  });
  const edges = [...stepToNodeMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([_, node], idx, arr) => ({
      from: node,
      to: idx === arr.length - 1 ? LANGGRAPH_END_NODE_NAME : arr[idx + 1][1],
    }));

  return {
    graph: {
      nodes,
      edges,
    },
    nodeToParentObservationMap: Object.fromEntries(
      nodeToParentObservationMap.entries(),
    ),
  };
}

function parseGenericAgentData(agentGraphData: AgentGraphDataResponse[]): {
  graph: GraphCanvasData;
  nodeToParentObservationMap: Record<string, string>;
} {
  console.log(
    "DEBUG: parseGenericAgentData received:",
    JSON.stringify(agentGraphData),
  );

  const obsById = new Map<string, AgentGraphDataResponse>();
  const nodeToFirstOccurrence = new Map<string, AgentGraphDataResponse>();
  const nodeToParentObservationMap = new Map<string, string>();
  const nodeOccurrences = new Map<string, number>();

  agentGraphData.forEach((obs) => {
    obsById.set(obs.id, obs);

    const nodeName = obs.name;

    // Track first occurrence and count
    if (!nodeToFirstOccurrence.has(nodeName)) {
      nodeToFirstOccurrence.set(nodeName, obs);
      nodeToParentObservationMap.set(nodeName, obs.id);
      nodeOccurrences.set(nodeName, 1);
    } else {
      nodeOccurrences.set(nodeName, (nodeOccurrences.get(nodeName) || 0) + 1);
    }
  });

  // Get all unique nodes with their types (much faster than Set + map)
  const nodes = Array.from(nodeToFirstOccurrence.entries()).map(
    ([nodeName, obs]) => ({
      id: nodeName,
      label: nodeName,
      type: obs.type,
    }),
  );

  console.log("DEBUG: All nodes with types:", JSON.stringify(nodes));

  // Build edges using both hierarchy and timing
  const edges: { from: string; to: string }[] = [];
  const processedPairs = new Set<string>(); // Avoid duplicate edges

  // Sort observations by start time for temporal analysis
  const sortedObs = [...agentGraphData].sort(
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

  console.log("DEBUG: Generated edges:", JSON.stringify(edges));
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

  return {
    graph: {
      nodes,
      edges,
    },
    nodeToParentObservationMap: Object.fromEntries(
      nodeToParentObservationMap.entries(),
    ),
  };
}
