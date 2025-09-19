import React, { useEffect, useState, useMemo, useCallback } from "react";
import { StringParam, useQueryParam } from "use-query-params";

import { TraceGraphCanvas } from "./TraceGraphCanvas";
import { type AgentGraphDataResponse } from "../types";
import { buildStepData } from "../buildStepData";
import {
  buildGraphFromStepData,
  transformLanggraphToGeneralized,
} from "../buildGraphCanvasData";
import {
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
  LANGGRAPH_START_NODE_NAME,
  LANGGRAPH_END_NODE_NAME,
} from "../types";

const MAX_NODE_NUMBER_FOR_PHYSICS = 500;

type TraceGraphViewProps = {
  agentGraphData: AgentGraphDataResponse[];
};

export const TraceGraphView: React.FC<TraceGraphViewProps> = ({
  agentGraphData,
}) => {
  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null);
  const [currentObservationId, setCurrentObservationId] = useQueryParam(
    "observation",
    StringParam,
  );
  const [currentObservationIndices, setCurrentObservationIndices] = useState<{
    [nodeName: string]: number;
  }>({});
  const [previousSelectedNode, setPreviousSelectedNode] = useState<
    string | null
  >(null);

  const normalizedData = useMemo(() => {
    const hasStepData = agentGraphData.some(
      (o) => o.step != null && o.step !== 0 && o.node != null,
    );
    if (!hasStepData) {
      // has no steps → add timing-based steps
      return buildStepData(agentGraphData);
    } else {
      const isLangGraph = agentGraphData.some(
        (o) => o.node && o.node.trim().length > 0,
      );
      if (isLangGraph) {
        // TODO: make detection more robust based on metadata
        return transformLanggraphToGeneralized(agentGraphData);
      } else {
        return agentGraphData; // Already normalized
      }
    }
  }, [agentGraphData]);

  const { graph, nodeToObservationsMap } = useMemo(() => {
    return buildGraphFromStepData(normalizedData);
  }, [normalizedData]);

  const shouldDisablePhysics =
    agentGraphData.length >= MAX_NODE_NUMBER_FOR_PHYSICS;

  const enhancedGraph = useMemo(() => {
    return {
      ...graph,
      nodes: graph.nodes.map((node) => {
        const isSystemNode =
          node.id === LANGFUSE_START_NODE_NAME ||
          node.id === LANGFUSE_END_NODE_NAME ||
          node.id === LANGGRAPH_START_NODE_NAME ||
          node.id === LANGGRAPH_END_NODE_NAME;

        if (isSystemNode) {
          return node; // Return unchanged for system nodes
        }

        const observations = nodeToObservationsMap[node.id] || [];
        const currentIndex = currentObservationIndices[node.id] || 0;
        const counter =
          observations.length > 1
            ? ` (${currentIndex + 1}/${observations.length})`
            : "";

        return {
          ...node,
          label: `${node.label}${counter}`,
        };
      }),
    };
  }, [graph, nodeToObservationsMap, currentObservationIndices]);

  useEffect(() => {
    // Find which node and index corresponds to currentObservationId
    let foundNodeName = null;
    let foundIndex = 0;

    for (const [nodeName, observations] of Object.entries(
      nodeToObservationsMap,
    )) {
      const index = observations.findIndex(
        (obsId) => obsId === currentObservationId,
      );
      if (index !== -1) {
        foundNodeName = nodeName;
        foundIndex = index;
        break;
      }
    }

    if (
      foundNodeName &&
      graph.nodes.some((node) => node.id === foundNodeName)
    ) {
      setSelectedNodeName(foundNodeName);
      setCurrentObservationIndices((prev) => ({
        ...prev,
        [foundNodeName]: foundIndex,
      }));
      setPreviousSelectedNode(foundNodeName);
    } else {
      setSelectedNodeName(null);
      setPreviousSelectedNode(null);
    }
  }, [
    currentObservationId,
    agentGraphData,
    graph.nodes,
    nodeToObservationsMap,
  ]);

  const onCanvasNodeNameChange = useCallback(
    (nodeName: string | null) => {
      console.log("[TraceGraphView] Node clicked:", nodeName);
      if (nodeName) {
        // Don't cycle through system nodes (start/end nodes)
        const isSystemNode =
          nodeName === LANGFUSE_START_NODE_NAME ||
          nodeName === LANGFUSE_END_NODE_NAME ||
          nodeName === LANGGRAPH_START_NODE_NAME ||
          nodeName === LANGGRAPH_END_NODE_NAME;

        if (isSystemNode) {
          // For system nodes, just select without cycling logic
          const observations = nodeToObservationsMap[nodeName] || [];
          if (observations.length > 0) {
            setCurrentObservationId(observations[0]);
          }
          setPreviousSelectedNode(nodeName);
          setSelectedNodeName(nodeName);
          return;
        }

        const observations = nodeToObservationsMap[nodeName] || [];
        if (observations.length > 0) {
          let targetIndex = 0;

          // If clicking the same node as before, cycle to next observation
          if (previousSelectedNode === nodeName && observations.length > 1) {
            const currentIndex = currentObservationIndices[nodeName] || 0;
            targetIndex = (currentIndex + 1) % observations.length;
            console.log(
              `[TraceGraphView] Cycling ${nodeName}: ${currentIndex + 1} -> ${targetIndex + 1}/${observations.length}`,
            );
          }

          setCurrentObservationIndices((prev) => ({
            ...prev,
            [nodeName]: targetIndex,
          }));
          setCurrentObservationId(observations[targetIndex]);
        }
        setPreviousSelectedNode(nodeName);
      } else {
        setPreviousSelectedNode(null);
      }

      setSelectedNodeName(nodeName);
    },
    [
      nodeToObservationsMap,
      currentObservationIndices,
      previousSelectedNode,
      setCurrentObservationId,
    ],
  );

  return (
    <div className="grid h-full w-full gap-4">
      <TraceGraphCanvas
        graph={enhancedGraph}
        selectedNodeName={selectedNodeName}
        onCanvasNodeNameChange={onCanvasNodeNameChange}
        disablePhysics={shouldDisablePhysics}
      />
    </div>
  );
};
