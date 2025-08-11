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
  const { graph, nodeToParentObservationMap } = useMemo(() => {
    console.log(
      "🔍 Frontend graph processing, data:",
      JSON.stringify(agentGraphData, null, 2),
    );

    const hasLangGraphSteps = agentGraphData.some(
      (item) => typeof item.step === "number" && item.step >= 0,
    );

    const hasTypeBasedData = agentGraphData.some(
      (item) =>
        item.type &&
        ["AGENT", "TOOL", "CHAIN", "RETRIEVER", "EMBEDDING"].includes(
          item.type,
        ),
    );

    const hasTimingData = agentGraphData.some((item) => item.startTime);

    console.log("🔍 Graph type detection:", {
      hasLangGraphSteps,
      hasTypeBasedData,
      hasTimingData,
    });

    // Use timing-aware processing if we have type and timing data
    if (hasTypeBasedData && hasTimingData) {
      console.log("🔍 Using timing-aware graph processing");
      return parseTimingAwareGraph({ agentGraphData });
    }

    // Detect if this is manual graph instrumentation (has nodes without LangGraph step metadata)
    const hasManualGraph = agentGraphData.some(
      (item) =>
        item.node &&
        !agentGraphData.some(
          (i) =>
            i.node === item.node && typeof i.step === "number" && i.step >= 0,
        ),
    );

    return hasManualGraph
      ? parseManualGraph({ agentGraphData })
      : parseGraph({ agentGraphData });
  }, [agentGraphData]);

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

function parseTimingAwareGraph(params: {
  agentGraphData: AgentGraphDataResponse[];
}): {
  graph: GraphCanvasData;
  nodeToParentObservationMap: Record<string, string>;
} {
  const { agentGraphData } = params;
  console.log(
    "🔍 Frontend parseTimingAwareGraph processing",
    agentGraphData.length,
    "items",
  );

  const nodeToParentObservationMap = new Map<string, string>();
  const stepToNodeMap = new Map<number, string>();

  // Build node-to-observation mapping and step ordering (from backend processing)
  agentGraphData.forEach((o) => {
    const { node, step } = o;

    // Map node to its observation ID for click navigation
    nodeToParentObservationMap.set(node, o.id);

    // Use step ordering for edges (timing-aware steps calculated by backend)
    if (typeof step === "number") {
      stepToNodeMap.set(step, node);
    }
  });

  // Extract unique nodes
  const nodes = [...new Set(agentGraphData.map((o) => o.node))];
  console.log("🔍 Frontend timing-aware nodes:", nodes);

  // Create edges from parent-child relationships (calculated by backend timing-aware processing)
  const edges: { from: string; to: string }[] = [];

  agentGraphData.forEach((item) => {
    // Look for other items that have this item as parent
    const children = agentGraphData.filter((child) => {
      // Check if there's a timing-aware parent relationship
      // This could be stored in parentObservationId or derived from step relationships
      // For timing-aware graphs, we need to reconstruct edges from the step-based ordering
      // but preserve parallel relationships

      // If child has a higher step number, it might be connected
      return child.step > item.step;
    });

    // For now, create edges based on consecutive steps within the same level
    // This is a simplified approach - the backend should ideally send explicit edge data
    const nextStep = item.step + 1;
    const nextStepItems = agentGraphData.filter(
      (next) => next.step === nextStep,
    );

    nextStepItems.forEach((nextItem) => {
      const edge = {
        from: item.node,
        to: nextItem.node,
      };
      console.log("🔍 Frontend timing-aware edge:", edge);
      edges.push(edge);
    });
  });

  console.log("🔍 Frontend timing-aware graph result:", { nodes, edges });

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

function parseManualGraph(params: {
  agentGraphData: AgentGraphDataResponse[];
}): {
  graph: GraphCanvasData;
  nodeToParentObservationMap: Record<string, string>;
} {
  const { agentGraphData } = params;

  const nodeToParentObservationMap = new Map<string, string>();
  const stepToNodeMap = new Map<number, string>();

  // Build node-to-observation mapping and step ordering
  agentGraphData.forEach((o) => {
    const { node, step } = o;

    // Map node to its observation ID for click navigation
    nodeToParentObservationMap.set(node, o.id);

    // Use step ordering for edges (created by BFS algorithm in backend)
    if (typeof step === "number") {
      stepToNodeMap.set(step, node);
    }
  });

  // Extract unique nodes (skip LangGraph start/end nodes for manual graphs)
  const nodes = [...new Set(agentGraphData.map((o) => o.node))];

  // Create edges from sequential steps (only between nodes we have)
  const edges = [...stepToNodeMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([_, node], idx, arr) => {
      // Connect to next step if it exists, otherwise no outgoing edge
      if (idx < arr.length - 1) {
        return {
          from: node,
          to: arr[idx + 1][1],
        };
      }
      return null;
    })
    .filter(Boolean) as { from: string; to: string }[];

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
