import React, { useEffect, useState, useMemo, useCallback } from "react";
import { StringParam, useQueryParam } from "use-query-params";

import { TraceGraphCanvas } from "./TraceGraphCanvas";
import { type AgentGraphDataResponse } from "../types";
import { buildStepData } from "../buildStepData";
import {
  buildGraphFromStepData,
  transformLanggraphToGeneralized,
} from "../buildGraphCanvasData";

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

  const { graph, nodeToParentObservationMap } = useMemo(() => {
    return buildGraphFromStepData(normalizedData);
  }, [normalizedData]);

  const shouldDisablePhysics =
    agentGraphData.length >= MAX_NODE_NUMBER_FOR_PHYSICS;

  useEffect(() => {
    const nodeName = Object.keys(nodeToParentObservationMap).find(
      (nodeKey) => nodeToParentObservationMap[nodeKey] === currentObservationId,
    );

    // Only set selectedNodeName if the node actually exists in the graph
    if (nodeName && graph.nodes.some((node) => node.id === nodeName)) {
      setSelectedNodeName(nodeName);
    } else {
      setSelectedNodeName(null);
    }
  }, [
    currentObservationId,
    agentGraphData,
    graph.nodes,
    nodeToParentObservationMap,
  ]);

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
        disablePhysics={shouldDisablePhysics}
      />
    </div>
  );
};
