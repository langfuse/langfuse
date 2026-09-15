import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { ObservationType } from "@langfuse/shared";

import { ElkGraphRenderer } from "./ElkGraphRenderer";
import { GraphViewModeSwitch } from "./GraphViewModeSwitch";
import {
  type AgentGraphDataResponse,
  type GraphViewMode,
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
  LANGGRAPH_START_NODE_NAME,
  LANGGRAPH_END_NODE_NAME,
} from "../types";
import { buildStepData } from "../buildStepData";
import {
  buildGraphFromStepData,
  transformLanggraphToGeneralized,
} from "../buildGraphCanvasData";
import { buildExpandedGraph } from "../buildExpandedGraph";
import {
  matchedGraphNodeNames,
  nearestGraphNodeName,
  type GraphNodeResolution,
} from "../graphNodeMatching";

type TraceGraphViewProps = {
  agentGraphData: AgentGraphDataResponse[];
  /**
   * Observation ids "playing" at the timeline playhead (from PlayheadContext).
   * Mapped to their node names here so the graph glows in sync with the timeline.
   */
  activeObservationIds?: ReadonlySet<string>;
  /** How the graph is built (aggregated vs expanded) — see GraphViewMode. */
  viewMode?: GraphViewMode;
  /** When provided, the mode switch is rendered over the canvas. */
  onViewModeChange?: (mode: GraphViewMode) => void;
  /**
   * Called when an in-canvas node click selects an observation (including
   * cycling a repeated node) — the host's analytics seam. Not called for
   * system start/end nodes or background deselects.
   */
  onObservationSelect?: () => void;
  /**
   * Playback transport rendered beside the mode switch. A slot (not an import)
   * so this feature module stays free of trace-view context dependencies.
   */
  transport?: React.ReactNode;
  /**
   * The active search, or absent when there is none. Handed in as OBSERVATION
   * ids because what counts as a match is the trace panel's one rule
   * (`matchesSearchQuery`) and this module stays free of the trace-view
   * contexts; projecting those ids onto graph nodes is the graph's own job and
   * depends on the view mode, so it happens here.
   */
  search?: {
    matchedObservationIds: ReadonlySet<string>;
    /** Quiet readout — the same "N matches" / "No matches" the timeline shows. */
    label: string;
  };
};

export const TraceGraphView: React.FC<TraceGraphViewProps> = ({
  agentGraphData,
  activeObservationIds,
  viewMode = "aggregated",
  onViewModeChange,
  onObservationSelect,
  transport,
  search,
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

  // In expanded mode node ids are observation ids (one node per call); in
  // aggregated mode they are step names (repeats collapse into one node).
  const isExpanded = viewMode === "expanded";

  const { graph, nodeToObservationsMap, limitExceeded } = useMemo(() => {
    if (isExpanded) {
      // Expanded ignores framework metadata: the instrumented hierarchy is
      // the source of truth, so EVERY call becomes a node — including e.g.
      // the LLM/tool calls inside LangGraph nodes, which the aggregated
      // path's normalization filters out. Only EVENTs stay excluded
      // (matching buildStepData's policy for the graph views).
      return buildExpandedGraph(
        agentGraphData.filter(
          (o) => o.observationType !== ObservationType.EVENT,
        ),
        agentGraphData,
      );
    }
    return { ...buildGraphFromStepData(normalizedData), limitExceeded: false };
  }, [normalizedData, isExpanded, agentGraphData]);

  const graphNodeIds = useMemo(
    () => new Set(graph.nodes.map((node) => node.id)),
    [graph.nodes],
  );

  // Unfiltered observation lookup for the parent-walk fallback below (child
  // observations without a langgraph node are absent from normalizedData).
  const agentGraphById = useMemo(
    () => new Map(agentGraphData.map((o) => [o.id, o])),
    [agentGraphData],
  );

  // observation id → its node id, so the playhead's active-observation set can
  // be projected onto graph nodes. Aggregated: id → node NAME from the full
  // data (nodeToObservationsMap only holds the top-most of a same-name chain).
  // Expanded: node ids ARE observation ids — the projection is identity over
  // the unfiltered data (ids that aren't graph nodes simply never match).
  const observationToNodeName = useMemo(() => {
    const map = new Map<string, string>();
    if (isExpanded) {
      for (const o of agentGraphData) {
        if (o.id) map.set(o.id, o.id);
      }
    } else {
      for (const o of normalizedData) {
        if (o.id && o.node) map.set(o.id, o.node);
      }
    }
    return map;
  }, [normalizedData, agentGraphData, isExpanded]);

  /**
   * Everything the "which node is this observation?" walk needs, in the active
   * view mode. Built once and shared by the selection fallback below and the
   * search projection, so a click and a query resolve an unmapped observation
   * to the same node.
   */
  const nodeResolution = useMemo<GraphNodeResolution>(
    () => ({
      isExpanded,
      observationsById: agentGraphById,
      graphNodeIds,
      nodeByObservationId: new Map(
        normalizedData.flatMap((o) =>
          o.id && o.node ? [[o.id, o.node] as [string, string]] : [],
        ),
      ),
    }),
    [isExpanded, agentGraphById, graphNodeIds, normalizedData],
  );

  const activeNodeNames = useMemo(() => {
    if (!activeObservationIds || activeObservationIds.size === 0) return null;
    const names = new Set<string>();
    for (const id of activeObservationIds) {
      const name = observationToNodeName.get(id);
      if (name) names.add(name);
    }
    return names;
  }, [activeObservationIds, observationToNodeName]);

  // A node stands for every call of its step, so it keeps its colour when ANY
  // observation behind it matched — including the ones no node registers, which
  // resolve to the nearest ancestor the graph kept. `null` means no query and
  // nothing dims; an empty set means a query that hit nothing, and the whole
  // graph fades.
  const matchedNodeNames = useMemo(() => {
    if (!search) return null;
    return matchedGraphNodeNames({
      matchedObservationIds: search.matchedObservationIds,
      nodeToObservationsMap,
      resolution: nodeResolution,
    });
  }, [search, nodeToObservationsMap, nodeResolution]);

  // Reset indices when graph data changes (new trace loaded)
  useEffect(() => {
    setCurrentObservationIndices({});
  }, [normalizedData]);

  // A mode switch rebuilds the graph in a different node-id space, so the
  // selection must re-resolve. Clear any stale click-echo entry first (runs
  // before the sync effect below — declaration order) or it would swallow
  // that re-sync and silently drop the highlight.
  useEffect(() => {
    clickWroteObservationIdRef.current = undefined;
  }, [viewMode]);

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

    // Fallback for observations the cycling map does not register: resolve to
    // the nearest ancestor the graph kept. EVENTs, LangGraph child spans and
    // nested same-name calls all land here, and selecting one should keep its
    // enclosing node focused rather than clearing the selection. The search
    // highlight resolves them through the same function.
    if (!foundNodeName && currentObservationId) {
      foundNodeName = nearestGraphNodeName(
        currentObservationId,
        nodeResolution,
      );
    }

    if (foundNodeName && graphNodeIds.has(foundNodeName)) {
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
    graphNodeIds,
    nodeToObservationsMap,
    nodeResolution,
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
          onObservationSelect?.();
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
      onObservationSelect,
    ],
  );

  return (
    <div className="@container/graphcanvas relative h-full w-full">
      {limitExceeded ? (
        <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-sm">
          This trace branches too widely for the expanded graph — use the
          aggregated view.
        </div>
      ) : (
        <ElkGraphRenderer
          graph={graph}
          selectedNodeName={selectedNodeName}
          onCanvasNodeNameChange={onCanvasNodeNameChange}
          nodeToObservationsMap={nodeToObservationsMap}
          currentObservationIndices={currentObservationIndices}
          activeNodeNames={activeNodeNames}
          matchedNodeNames={matchedNodeNames}
          // Expanded runs are long chains — left→right reads like a
          // timeline and fits the wide graph panel far better than top-down.
          layoutDirection={isExpanded ? "RIGHT" : "DOWN"}
          // Only the aggregated (DOWN) layout hits the size budget; when it
          // does, offer the budget-exempt expanded view as the in-place
          // recovery (it renders the same trace as an acyclic DAG).
          onShowExpanded={
            onViewModeChange && !isExpanded
              ? () => onViewModeChange("expanded")
              : null
          }
        />
      )}
      {(onViewModeChange || transport || search) && (
        // Overlaid sibling of the canvas (top-left, opposite the zoom stack)
        // so canvas clicks/gestures underneath are untouched.
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
          {onViewModeChange && (
            <GraphViewModeSwitch value={viewMode} onChange={onViewModeChange} />
          )}
          {transport}
          {/* What the dimming means, said in words and in the same place the
              timeline says it. Without it, "nothing matched" and "the matches
              are off-canvas" look identical. Carries the switch's own
              background so it stays legible over nodes and edges. */}
          {search && (
            <span
              className="bg-background/80 text-muted-foreground truncate rounded-md border px-2 py-1 text-xs backdrop-blur"
              title={search.label}
              data-testid="graph-search-count"
            >
              {search.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
