import React, { useEffect, useState, useMemo, useCallback } from "react";
import { StringParam, useQueryParam } from "use-query-params";

import { TraceGraphCanvas } from "./TraceGraphCanvas";
import { type AgentGraphDataResponse } from "../types";
import { buildLanggraphStructure } from "../buildLanggraphStructure";
import { buildGeneralizedStructure } from "../buildGeneralizedStructure";

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

  const { graph, nodeToParentObservationMap } = useMemo(() => {
    const hasLanggraphData = agentGraphData.some(
      (o) => o.step != null && o.step !== 0,
    );

    if (hasLanggraphData) {
      return buildLanggraphStructure(agentGraphData);
    } else {
      return buildGeneralizedStructure(agentGraphData);
    }
  }, [agentGraphData]);

  useEffect(() => {
    const nodeName = agentGraphData.find(
      (o) => o.id === currentObservationId,
    )?.node;

    // Only set selectedNodeName if the node actually exists in the graph
    if (nodeName && graph.nodes.some((node) => node.id === nodeName)) {
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
