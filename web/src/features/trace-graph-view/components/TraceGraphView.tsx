import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { StringParam, useQueryParam } from "use-query-params";

import { ElkGraphRenderer } from "./ElkGraphRenderer";
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

type TraceGraphViewProps = {
  agentGraphData: AgentGraphDataResponse[];
  /**
   * Observation ids "playing" at the timeline playhead (from PlayheadContext).
   * Mapped to their node names here so the graph glows in sync with the timeline.
   */
  activeObservationIds?: ReadonlySet<string>;
};

export const TraceGraphView: React.FC<TraceGraphViewProps> = ({
  agentGraphData,
  activeObservationIds,
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
  // The observation id the last in-canvas click WROTE to the URL (undefined =
  // no pending click write). Value-compared — a plain boolean flag gets stuck
  // when a click writes the same id the URL already has (the effect never
  // re-fires to clear it) and then swallows the NEXT genuine tree/timeline
  // selection, desyncing the graph highlight.
  const clickWroteObservationIdRef = useRef<string | null | undefined>(
    undefined,
  );

  const normalizedData = useMemo(() => {
    const hasStepData = agentGraphData.some(
      (o) => o.step != null && o.step !== 0 && o.node != null,
    );
    if (!hasStepData) {
      // has no steps → add timing-based steps
      return buildStepData(agentGraphData);
    }
    const isLangGraph = agentGraphData.some(
      (o) => o.node && o.node.trim().length > 0,
    );
    if (isLangGraph) {
      // TODO: make detection more robust based on metadata
      return transformLanggraphToGeneralized(agentGraphData);
    }
    return agentGraphData; // Already normalized
  }, [agentGraphData]);

  const { graph, nodeToObservationsMap } = useMemo(() => {
    return buildGraphFromStepData(normalizedData);
  }, [normalizedData]);

  // Unfiltered observation lookup for the parent-walk fallback below (child
  // observations without a langgraph node are absent from normalizedData).
  const agentGraphById = useMemo(
    () => new Map(agentGraphData.map((o) => [o.id, o])),
    [agentGraphData],
  );

  // observation id → its node name, so the playhead's active-observation set can
  // be projected onto graph nodes (nodeToObservationsMap only holds the top-most
  // of a same-name chain, so build the reverse map from the full data instead).
  const observationToNodeName = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of normalizedData) {
      if (o.id && o.node) map.set(o.id, o.node);
    }
    return map;
  }, [normalizedData]);

  const activeNodeNames = useMemo(() => {
    if (!activeObservationIds || activeObservationIds.size === 0) return null;
    const names = new Set<string>();
    for (const id of activeObservationIds) {
      const name = observationToNodeName.get(id);
      if (name) names.add(name);
    }
    return names;
  }, [activeObservationIds, observationToNodeName]);

  // Reset indices when graph data changes (new trace loaded)
  useEffect(() => {
    setCurrentObservationIndices({});
  }, [normalizedData]);

  useEffect(() => {
    // Skip genuine echoes of an in-canvas click (the click already selected the
    // node); a stale entry from a no-op write is cleared and IGNORED when a
    // genuinely different observation arrives, so the graph re-syncs.
    if (clickWroteObservationIdRef.current !== undefined) {
      const wrote = clickWroteObservationIdRef.current;
      clickWroteObservationIdRef.current = undefined;
      if (wrote === (currentObservationId ?? null)) return;
    }

    // Find which node and index corresponds to currentObservationId.
    let foundNodeName: string | null = null;
    let foundIndex: number | null = null;

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

    // Fallback for observations not in the cycling map: nested/repeated
    // same-name observations (only the top-most of a same-name chain is
    // registered) map to their own node; descendants WITHOUT a node of their
    // own (e.g. LangGraph child spans, which are filtered out of
    // normalizedData) resolve by walking UP the parent chain in the unfiltered
    // data until an ancestor carries one — so selecting any descendant keeps
    // its enclosing node focused instead of clearing the selection.
    if (!foundNodeName && currentObservationId) {
      const own = normalizedData.find((o) => o.id === currentObservationId);
      if (own?.node) {
        foundNodeName = own.node;
      } else {
        const seen = new Set<string>();
        let cursor = agentGraphById.get(currentObservationId);
        while (cursor && !seen.has(cursor.id)) {
          seen.add(cursor.id);
          if (cursor.node) {
            foundNodeName = cursor.node;
            break;
          }
          cursor = cursor.parentObservationId
            ? agentGraphById.get(cursor.parentObservationId)
            : undefined;
        }
      }
    }

    if (
      foundNodeName &&
      graph.nodes.some((node) => node.id === foundNodeName)
    ) {
      setSelectedNodeName(foundNodeName);
      // Only sync the cycling index when the id was actually found in the
      // cycling map — fallback-resolved observations must not rewind the
      // node's "(x/N)" counter and next-click cycle position to 0.
      if (foundIndex !== null) {
        const nodeKey = foundNodeName;
        const index = foundIndex;
        setCurrentObservationIndices((prev) => ({
          ...prev,
          [nodeKey]: index,
        }));
      }
      setPreviousSelectedNode(foundNodeName);
    } else {
      setSelectedNodeName(null);
      setPreviousSelectedNode(null);
    }
  }, [
    currentObservationId,
    agentGraphById,
    graph.nodes,
    nodeToObservationsMap,
    normalizedData,
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
          clickWroteObservationIdRef.current = null;
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
          clickWroteObservationIdRef.current = observations[targetIndex];
          setCurrentObservationId(observations[targetIndex]);
        } else {
          clickWroteObservationIdRef.current = null;
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
    <div className="h-full w-full">
      <ElkGraphRenderer
        graph={graph}
        selectedNodeName={selectedNodeName}
        onCanvasNodeNameChange={onCanvasNodeNameChange}
        nodeToObservationsMap={nodeToObservationsMap}
        currentObservationIndices={currentObservationIndices}
        activeNodeNames={activeNodeNames}
      />
    </div>
  );
};
