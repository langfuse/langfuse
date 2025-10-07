import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
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
  console.log(
    `DEBUG: [GraphView] Rendering TraceGraphView with ${agentGraphData.length} items`,
  );

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
  const isClickNavigationRef = useRef(false);

  const normalizedData = useMemo(() => {
    console.log(
      `DEBUG: [GraphView] Starting normalizedData calculation with ${agentGraphData.length} items`,
    );
    const startTime = performance.now();

    const hasStepData = agentGraphData.some(
      (o) => o.step != null && o.step !== 0 && o.node != null,
    );
    console.log(`DEBUG: [GraphView] hasStepData: ${hasStepData}`);

    let result;
    if (!hasStepData) {
      console.log(`DEBUG: [GraphView] Calling buildStepData`);
      const buildStart = performance.now();
      result = buildStepData(agentGraphData);
      console.log(
        `DEBUG: [GraphView] buildStepData took ${(performance.now() - buildStart).toFixed(2)}ms`,
      );
    } else {
      const isLangGraph = agentGraphData.some(
        (o) => o.node && o.node.trim().length > 0,
      );
      console.log(`DEBUG: [GraphView] isLangGraph: ${isLangGraph}`);

      if (isLangGraph) {
        console.log(
          `DEBUG: [GraphView] Calling transformLanggraphToGeneralized`,
        );
        const transformStart = performance.now();
        result = transformLanggraphToGeneralized(agentGraphData);
        console.log(
          `DEBUG: [GraphView] transformLanggraphToGeneralized took ${(performance.now() - transformStart).toFixed(2)}ms`,
        );
      } else {
        console.log(`DEBUG: [GraphView] Using agentGraphData as-is`);
        result = agentGraphData; // Already normalized
      }
    }

    const totalTime = performance.now() - startTime;
    console.log(
      `DEBUG: [GraphView] normalizedData calculation complete, took ${totalTime.toFixed(2)}ms, result length: ${result.length}`,
    );
    return result;
  }, [agentGraphData]);

  const { graph, nodeToObservationsMap } = useMemo(() => {
    console.log(
      `DEBUG: [GraphView] Starting buildGraphFromStepData with ${normalizedData.length} items`,
    );
    const startTime = performance.now();
    const result = buildGraphFromStepData(normalizedData);
    const totalTime = performance.now() - startTime;
    console.log(
      `DEBUG: [GraphView] buildGraphFromStepData complete, took ${totalTime.toFixed(2)}ms, nodes: ${result.graph.nodes.length}, edges: ${result.graph.edges.length}`,
    );
    return result;
  }, [normalizedData]);

  const shouldDisablePhysics =
    agentGraphData.length >= MAX_NODE_NUMBER_FOR_PHYSICS;

  // Reset indices when graph data changes (new trace loaded)
  useEffect(() => {
    setCurrentObservationIndices({});
  }, [normalizedData]);

  useEffect(() => {
    // if this observation ID change came from a click -> skip
    if (isClickNavigationRef.current) {
      isClickNavigationRef.current = false;
      return;
    }

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
      if (nodeName) {
        // Don't cycle through system nodes (start/end nodes)
        const isSystemNode =
          nodeName === LANGFUSE_START_NODE_NAME ||
          nodeName === LANGFUSE_END_NODE_NAME ||
          nodeName === LANGGRAPH_START_NODE_NAME ||
          nodeName === LANGGRAPH_END_NODE_NAME;

        if (isSystemNode) {
          // For system nodes, don't set observation ID (they're synthetic)
          setPreviousSelectedNode(nodeName);
          setSelectedNodeName(nodeName);
          isClickNavigationRef.current = true;
          setCurrentObservationId(null);
          return;
        }

        const observations = nodeToObservationsMap[nodeName] || [];

        if (observations.length > 0) {
          let targetIndex = 0;

          // If clicking the same node as before, cycle to next observation
          if (previousSelectedNode === nodeName && observations.length > 1) {
            const currentIndex = currentObservationIndices[nodeName] || 0;
            targetIndex = (currentIndex + 1) % observations.length;
          }

          setCurrentObservationIndices((prev) => ({
            ...prev,
            [nodeName]: targetIndex,
          }));
          isClickNavigationRef.current = true;
          setCurrentObservationId(observations[targetIndex]);
        } else {
          isClickNavigationRef.current = true;
          setCurrentObservationId(null);
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
        graph={graph}
        selectedNodeName={selectedNodeName}
        onCanvasNodeNameChange={onCanvasNodeNameChange}
        disablePhysics={shouldDisablePhysics}
        nodeToObservationsMap={nodeToObservationsMap}
        currentObservationIndices={currentObservationIndices}
      />
    </div>
  );
};
