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
  const nodeToParentObservationMap = new Map<string, string>();
  const nodeToFirstOccurrence = new Map<string, AgentGraphDataResponse>();
  const edgeMap = new Map<string, Set<string>>();

  // Build hierarchy and track first occurrence of each node name
  agentGraphData.forEach((obs) => {
    const nodeName = obs.name;

    // Track first occurrence for node mapping
    if (!nodeToFirstOccurrence.has(nodeName)) {
      nodeToFirstOccurrence.set(nodeName, obs);
      nodeToParentObservationMap.set(nodeName, obs.id);
    }

    // Find parent node name for edge creation
    if (obs.parentObservationId) {
      const parent = agentGraphData.find(
        (p) => p.id === obs.parentObservationId,
      );
      if (parent) {
        const parentNodeName = parent.name;
        if (!edgeMap.has(parentNodeName)) {
          edgeMap.set(parentNodeName, new Set());
        }
        edgeMap.get(parentNodeName)?.add(nodeName);
      }
    }
  });

  // Get all unique nodes with their types
  const uniqueNodeNames = [...new Set(agentGraphData.map((obs) => obs.name))];
  const nodes = uniqueNodeNames.map((nodeName) => {
    const firstOccurrence = nodeToFirstOccurrence.get(nodeName);
    return {
      id: nodeName,
      label: nodeName,
      type: firstOccurrence?.type || "UNKNOWN",
    };
  });

  console.log("DEBUG: All nodes with types:", JSON.stringify(nodes));

  // Build edges from hierarchy
  const edges: { from: string; to: string }[] = [];
  edgeMap.forEach((children, parent) => {
    children.forEach((child) => {
      edges.push({ from: parent, to: child });
    });
  });

  // Add self-loop edges for repeated node names
  const nodeOccurrences = new Map<string, number>();
  agentGraphData.forEach((obs) => {
    const count = nodeOccurrences.get(obs.name) || 0;
    nodeOccurrences.set(obs.name, count + 1);
  });

  nodeOccurrences.forEach((count, nodeName) => {
    if (count > 1) {
      edges.push({ from: nodeName, to: nodeName });
    }
  });

  console.log("DEBUG: Generated edges:", JSON.stringify(edges));

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
