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

  const stepToNodeMap = new Map<number, string>();
  const nodeToParentObservationMap = new Map<string, string>();

  agentGraphData.forEach((o) => {
    const { node, step } = o;

    stepToNodeMap.set(step, node);

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
      if (o.node !== parent?.node) {
        nodeToParentObservationMap.set(node, o.id);
      }
    } else {
      nodeToParentObservationMap.set(node, o.id);
    }
  });

  const nodes = [
    ...new Set([...stepToNodeMap.values(), LANGGRAPH_END_NODE_NAME]),
  ];
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
